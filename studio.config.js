import { auth } from './src/config/auth.js';

const studioConfig = {
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

export default studioConfig;
