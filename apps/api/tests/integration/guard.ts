// Runs before every integration file. These tests empty the tables they use; refuse to start on any database that is
// not a test database, whatever the environment says.
const url = process.env.DATABASE_URL;
if (url) {
  const name = new URL(url).pathname.slice(1);
  if (!name.endsWith("_test")) throw new Error(`Integration tests refuse to run on "${name}": use a database whose name ends in _test (TEST_DATABASE_URL).`);
}
