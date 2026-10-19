import { toast, type ToastOptions } from "react-toastify";

// The old toast stayed seven seconds; every type keeps that.
const base: ToastOptions = { autoClose: 7000 };

export const notify = Object.assign((message: string) => toast.info(message, base), {
  info: (message: string) => toast.info(message, base),
  success: (message: string) => toast.success(message, base),
  warn: (message: string) => toast.warning(message, base),
  error: (message: string) => toast.error(message, base),
});
