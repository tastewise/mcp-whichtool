import { memo } from "react";
import { ToastContainer } from "react-toastify";

// react-toastify where the old .toast sat: bottom centre, one colour per type, closable.
function ToastHost() {
  return <ToastContainer position="bottom-center" theme="colored" autoClose={7000} closeOnClick pauseOnHover newestOnTop={false} />;
}

export default memo(ToastHost);
