import type { StudioConfig } from "better-auth-studio";
import { auth } from "./src/config/auth.js";

const config: StudioConfig = {
  auth,
  basePath: "/api/studio",
  metadata: {
    title: "MaurMaket Admin",
    theme: "dark",
  },
  access: {
    allowEmails: ["lexikonstrsut@gmail.com"],
  },
};

export default config;
