import anydbSQL = require('anydb-sql');
import Promise = require('bluebird');
import _ = require('lodash');
import fs = require('fs');
import path = require('path');

export interface Migration {
    version:string
}

export interface MigrationsTable extends anydbSQL.Table<Migration> {
    version:anydbSQL.Column<string>
}

export interface MigFn {
    (tx:anydbSQL.Transaction):Promise<any>
}

export interface MigrationTask {
    up:MigFn; down:MigFn; name:string
}

export function create(db:anydbSQL.AnydbSql, tasks:any) {

    var list:Array<MigrationTask> = [];
    var migrations = <MigrationsTable>db.define<Migration>({
        name:'_migrations',
        columns: {
            version: { dataType: db.dialect() === 'mysql' ? 'varchar(255)' : 'text', notNull: true, primaryKey: true }
        }
    });

    function runMigration(migfn:MigFn) {
        return db.transaction(tx => {
            return migrations.create().ifNotExists().execWithin(tx)
                .then(_ => migfn(tx))
                .thenReturn();
        });
    }

    function defineMigration(name: string, fns:{up:MigFn; down:MigFn}) {
        if (_.find(list, m => m.name == name) != null)
            return;
        list.push({name: name, up:fns.up, down: fns.down});
    }

    function findChain(first:string, last:string) {
        list = _.sortBy(list, item => item.name);
        var from = _.findIndex(list, item => item.name === first);
        var to = _.findIndex(list, item => item.name === last);

        if (to === -1)
            to = list.length - 1;

        if (from < to)
            return {type: 'up', items: list.slice(from+1, to+1)};
        else if (from > to)
            return {type: 'down', items: list.slice(to+1, from+1).reverse()};
        else
            return {type: 'none', items: []};
    }
    function add(tx:anydbSQL.Transaction, name:string) {
        return migrations.insert({version: name}).execWithin(tx);
    }
    function remove(tx:anydbSQL.Transaction, name: string) {
        return migrations.where({version: name}).delete().execWithin(tx);
    }

    function getMigrationList(tx:anydbSQL.Transaction, target?:string) {
        return migrations.select()
            .order(migrations.version.descending)
            .getWithin(tx)
            .then(current => findChain(current && current.version, target))

    }

    function runSingle(tx:anydbSQL.Transaction, type:string, m:MigrationTask) {
        return type == 'up' ?
            Promise.join(add(tx, m.name), m.up(tx)):
            Promise.join(remove(tx, m.name), m.down(tx));
    }
    function migrateTo(target?:string) {
        return runMigration(tx => getMigrationList(tx, target).then(
            migration => migration.items.reduce(
                (acc, m) => acc.then(_ => runSingle(tx, migration.type, m))
                    .then(_ => console.log("Completed:", m.name))
                    .thenReturn(), Promise.resolve())))
    }
    function loadFromPath(location:string) {
        fs.readdirSync(location)
            .filter(file => (/\.js$/.test(file)))
            .forEach(file => defineMigration(
                file.replace(/\.js$/, ''),
                require(path.resolve(location, file))));
    }
    function check(f:(m:{type: string; items: MigrationTask[]}) => any) {
        return runMigration(tx => getMigrationList(tx).then(f))
    }
    function run() {
        var args = require('yargs').argv;
        if (args.check)
            return check(l => {
                if (l.items.length) {
                    console.log("Migrations to run");
                    l.items.forEach(item => console.log("-", item.name))
                    process.exit(1);
                } else {
                    console.log("No pending migrations");
                    process.exit(0)
                }
            });
        else if (args.execute)
            return migrateTo().done(
                _ => process.exit(0),
                e => {
                    console.error(e.stack);
                    process.exit(1);
                });
        console.error("Add a --check or --execute argument");
        process.exit(1);
    }

    if (typeof(tasks) === 'string')
        loadFromPath(tasks);
    else
        tasks.forEach((task:MigrationTask) => defineMigration(task.name, task));


    return {
        run:run,
        migrateTo:migrateTo,
        check:check
    }
}
