"""The routing editor's routes: the cases, the tool descriptions in the source, and the AI that drafts them."""

import asyncio
import threading
from collections.abc import Callable

import httpx
from fastapi import Body, FastAPI, HTTPException, Query
from fastapi.responses import Response

from whichtool import export, routing, routing_advice, routing_eval
from whichtool.config import RoutingSpec
from whichtool.models import provider_of
from whichtool.routing_changes import Sources, case_identity, validate_cases


def install(app: FastAPI, spec: Callable[[], RoutingSpec], running: Callable[[], bool], ai_lock: asyncio.Lock) -> None:
    lock = threading.Lock()

    def mutate(action: Callable[[], dict]) -> dict:
        with lock:
            spec()
            if running():
                raise HTTPException(409, "Wait for the evaluation to finish before changing its inputs")
            try:
                return action()
            except (ValueError, OSError) as error:
                raise HTTPException(409, str(error)) from error

    async def offered(settings: RoutingSpec) -> list[str]:
        """What a case may expect: the tools the eval offers, from the server or the source."""
        async with httpx.AsyncClient() as http:
            return [tool.name for tool in await routing_eval.catalogue(settings, http)]

    @app.get("/api/routing/catalog")
    async def catalog() -> dict:
        settings = spec()
        try:
            names = await offered(settings)
        except ValueError:
            # A server that is down still leaves the cases to read, against every tool the source declares.
            names = list(routing_eval.declared(settings))
        try:
            return Sources(settings, names).catalog()
        except (ValueError, OSError) as error:
            raise HTTPException(409, str(error)) from error

    @app.put("/api/routing/catalog")
    async def save_catalog(payload: dict = Body(...)) -> dict:
        settings = spec()
        try:
            names = await offered(settings)
        except ValueError:
            # A server that is down still lets cases be saved, against every tool the source declares, as GET reads them.
            names = list(routing_eval.declared(settings))
        return mutate(lambda: Sources(settings, names).save_cases(payload.get("revision", ""), payload.get("cases")))

    @app.get("/api/routing/export")
    def export_kit(cases: list[str] | None = Query(None), format: str = "kit") -> Response:
        """The tests as a kit for the server's own repository (cases, project file, CI workflow, README),
        or `format=json`: the tests alone. `cases`: the ids to export, every test when none is named."""
        if format not in ("kit", "json"):
            raise HTTPException(422, f"No export format {format!r}: kit or json.")
        settings = spec()
        try:
            data = export.tests_json(settings, cases) if format == "json" else export.kit(settings, cases)
        except (ValueError, OSError) as error:
            raise HTTPException(409, f"The tests could not be read: {error}") from error
        kind, media = ("json", "application/json") if format == "json" else ("zip", "application/zip")
        name = f"routing-tests-{settings.cwd.name}.{kind}"
        return Response(data, media_type=media, headers={"content-disposition": f'attachment; filename="{name}"'})

    @app.get("/api/routing/descriptions")
    def sources() -> dict:
        try:
            return Sources(spec()).sources()
        except (ValueError, OSError, SyntaxError) as error:
            raise HTTPException(409, str(error)) from error

    @app.post("/api/routing/descriptions/apply")
    def apply_description(payload: dict = Body(...)) -> dict:
        return mutate(lambda: Sources(spec()).apply_description(
            payload.get("tool", ""), payload.get("revision", ""),
            payload.get("original_description", ""), payload.get("suggested_description", "")))

    @app.post("/api/routing/ai/stop")
    def stop_ai() -> dict:
        """Abandoning the wait is not enough: the call keeps running, and keeps billing."""
        return {"stopped": routing_advice.stop()}

    @app.post("/api/routing/catalog/generate/prompt")
    async def writing_prompt(payload: dict = Body(...)) -> dict:
        """The prompt that writes tests for one tool, as the model would get it: read before anything is billed."""
        settings = spec()
        tool, scenario = payload.get("tool"), payload.get("scenario", "")
        try:
            count = routing_advice.cases_wanted(payload.get("count"))
            if tool not in await offered(settings):
                raise HTTPException(400, "Choose an available tool")
            shown = await routing_advice.writing_prompt(settings, str(tool), str(scenario or ""),
                                                        Sources(settings).catalog()["cases"], count)
        except ValueError as error:
            raise HTTPException(400, str(error)) from error
        return shown | {"recommended": routing_advice.RECOMMENDED_CASES, "max": routing_advice.MAX_CASES}

    @app.post("/api/routing/catalog/generate")
    async def generate(payload: dict = Body(...)) -> dict:
        settings = spec()
        tool = payload.get("tool")
        try:
            names = await offered(settings)
        except ValueError as error:
            raise HTTPException(409, str(error)) from error
        if tool not in names:
            raise HTTPException(400, "Choose an available tool")
        scenario = payload.get("scenario", "")
        if not isinstance(scenario, str) or len(scenario) > 4000:
            raise HTTPException(400, "Scenario must be text, at most 4000 characters")
        try:
            count = routing_advice.cases_wanted(payload.get("count"))
        except ValueError as error:
            raise HTTPException(400, str(error)) from error
        # The model that writes the tests is the user's choice, any provider they hold a key for.
        model = payload.get("model") or settings.model
        if not isinstance(model, str) or len(model) > 200:
            raise HTTPException(400, "Name the model that writes the tests")
        provider = provider_of(model)
        if not (settings.anthropic_key if provider == "anthropic" else settings.openai_key):
            raise HTTPException(409, f"No API key for {provider}: add one under API keys, at the top of the page")
        if ai_lock.locked():
            raise HTTPException(409, "An AI request is already running")
        current = Sources(settings, names).catalog()
        async with ai_lock:
            try:
                proposed = await routing_advice.suggest(settings, {
                    "action": "generate", "tool": tool, "scenario": scenario,
                    "existing": current["cases"], "model": model, "count": count,
                })
                # Cases saved before keep their tool, offered or not, as a save treats them.
                validate_cases(current["cases"] + proposed["cases"], set(names),
                               {case_identity(case) for case in current["cases"] if isinstance(case, dict)})
            except (ValueError, OSError, RuntimeError) as error:
                raise HTTPException(502, str(error)) from error
            except asyncio.TimeoutError as error:
                raise HTTPException(504, "AI generation timed out") from error
        return proposed | {"cost": routing.cost(settings, proposed["model"], proposed.get("usage", {}))}

