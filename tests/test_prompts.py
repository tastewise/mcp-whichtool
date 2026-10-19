import subprocess
import sys

from whichtool import prompts


def test_a_question_asked_through_a_pipe_is_refused_not_answered() -> None:
    script = (
        "from whichtool import prompts\n"
        "try:\n"
        "    prompts.ask_text('Name?')\n"
        "except prompts.NotATerminal as reason:\n"
        "    print(reason)\n"
    )
    ran = subprocess.run([sys.executable, "-c", script], input="typed\n", capture_output=True, text=True, check=True)

    assert "run it in a terminal" in ran.stdout
    assert issubclass(prompts.NotATerminal, Exception)
