import type { DetailedHTMLProps, HTMLAttributes } from "react";

type Custom = DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>;

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "tw-header": Custom & { page?: string };
      "tw-client-panel": Custom;
    }
  }
}
