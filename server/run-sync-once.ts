import { runSingulartSync } from "./singulart-sync";

runSingulartSync()
  .then((r) => {
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.error ? 1 : 0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
