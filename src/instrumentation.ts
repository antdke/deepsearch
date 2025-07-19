import { registerOTel } from "@vercel/otel";
import { LangfuseExporter } from "langfuse-vercel";

export function register() {
  registerOTel({
    serviceName: "aihero-deepsource-course",
    traceExporter: new LangfuseExporter(),
  });
}
