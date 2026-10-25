import { createFreeService } from "../dist/free-service.js";

export default {
  fetch(request) {
    return createFreeService({ env: process.env }).fetch(request);
  },
};
