import process from "node:process";
export function runtimeTestEnv() {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) => !key.startsWith("DEMO_") && key !== "ALLOW_DEMO_SEED",
    ),
  );
}
