## anydb-sql-migrations

Database migrations for [anydb-sql](//github.com/doxout/anydb-sql)

## usage

Create a script called `migrate.js` and add the following

```js
#!/usr/bin/env node

var myanydbsql = require('./path/to/my/database/instance');

require('anydb-sql-migrate')
.create(myanydbsql, '/path/to/migrations/dir')
.run();
```

In your migrations dir, create a file named '001-empty-test.js' and add the code

```js
exports.up = function(transaction) {}
exports.down = function(transaction) {}
```

The first method is run when upgrading the db, while the second is run when
downgrading it. Both methods accept a single parameter - the transaction within
which that migration should run.

To check for pending migrations, use
```
./path/to/migrate.js --check
```

It should show `001-empty-test` and return a nonzero exit code

To run pending migrations, use

```
./path/to/migrate.js --execute
```

It should run the exported empty `up` function.

If you want to silently run the migrations, you can pass `{ silent: true }` to `run` and `migrate` functions

```js
require('anydb-sql-migrate')
.create(myanydbsql, '/path/to/migrations/dir')
.migrate({ silent: true }); // it will supress only console.logs, not errors
```

# license

MIT