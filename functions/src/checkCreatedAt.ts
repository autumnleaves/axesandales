/**
 * Standalone script — see checkCreatedAt.logic.ts for the actual logic.
 */
import {getDb} from "./adminApp";
import {checkCreatedAt} from "./checkCreatedAt.logic";

if (require.main === module) {
  checkCreatedAt(getDb())
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
