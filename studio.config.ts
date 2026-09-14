import type { StudioConfig } from "better-auth-studio";
import { getAuth } from "./src/config/auth.js";

const config: StudioConfig = {
  get auth() { return getAuth(); },
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
