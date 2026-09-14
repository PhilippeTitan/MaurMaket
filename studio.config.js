import { getAuth } from './src/config/auth.js';

const studioConfig = {
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

export default studioConfig;
