import Promise = require('bluebird');
import _ = require('lodash');
import fs = require('fs');
import path = require('path');

import { Column, Table, Transaction, AnydbSql } from 'anydb-sql';

export interface Migration {
    version:string
}

export interface MigrationsTable extends Table<Migration> {
    version:Column<string>
}

export interface MigFn {
    (tx:Transaction):Promise<any>
}

export interface MigrationTask {
    up:MigFn; down:MigFn; name:string
}

export function create(db:AnydbSql, tasks:string | MigrationTask[]) {
    var list:Array<MigrationTask> = [];
    var migrations = <MigrationsTable>db.define<Migration>({
        name: '_migrations',
        columns: {
            version: { dataType: db.dialect() === 'mysql' ? 'varchar(255)' : 'text', notNull: true, primaryKey: true }
        }
    });

    function runMigration(migfn:MigFn) {
        return db.transaction(tx => {
            return migrations.create().ifNotExists().execWithin(tx)
                .then(_ => migfn(tx, ))
                .thenReturn();
        });
    }

    function defineMigration(name: string, fns:{up:MigFn; down:MigFn}) {
        if (_.find(list, m => m.name == name) != null)
            return;
        list.push({ name: name, up: fns.up, down: fns.down });
    }

    function getMigrationList(tx: Transaction) {
        return migrations.select()
            .order(migrations.version.descending)
            .allWithin(tx)
            .then(migs => {
                var alreadyExecuted = migs.map(m => m.version)
                return _(list).sortBy(m => m.name).filter(m => !_.contains(alreadyExecuted, m.name)).value()
            })
    }

    function unmigrate() {

    }
    function add(tx:Transaction, name:string) {
        return migrations.insert({version: name}).execWithin(tx);
    }
    function remove(tx:Transaction, name: string) {
        return migrations.where({version: name}).delete().execWithin(tx);
    }


    function runSingle(tx:Transaction, type:"up" | "down", m:MigrationTask) {
        return type == 'up' ?
            m.up(tx).then(() => add(tx, m.name)) :
            m.down(tx).then(() => remove(tx, m.name));
    }
    function migrate() {
        return runMigration(tx => getMigrationList(tx).then(
            migrations => migrations.reduce(
                (acc, m) => acc.then(_ => runSingle(tx, "up", m))
                    .then(_ => console.log("Completed:", m.name))
                    .thenReturn(), Promise.resolve())))
    }
    function undoLast() {
        return runMigration(tx => migrations.select()
            .order(migrations.version.descending)
            .getWithin(tx).then(mig => {
                if (!mig) throw new Error("No migrations available to rollback")
                var undoMigration = _.find(list, item => item.name == mig.version)
                return runSingle(tx, "down", undoMigration)
            }))
    }

    function undoAll() {
        return runMigration(tx => migrations.select()
            .order(migrations.version.descending)
            .allWithin(tx).then(migrations => {
                return Promise.all(migrations.map(mig => {
                  const task = _.find(list, item => item.name == mig.version);

                  return runSingle(tx, "down", task);
                }));
            }));
    }

    function loadFromPath(location:string) {
        fs.readdirSync(location)
            .filter(file => (/\.js$/.test(file)))
            .forEach(file => defineMigration(
                file.replace(/\.js$/, ''),
                require(path.resolve(location, file))));
    }
    function check(f:(items: MigrationTask[]) => any) {
        return runMigration(tx => getMigrationList(tx).then(f))
    }
    function run() {
        const args = require('yargs').argv;
        if (args.check)
            return check(migrations => {
                if (migrations.length) {
                    console.log("Migrations to run");
                    migrations.forEach(item => console.log("-", item.name));
                    process.exit(1);
                } else {
                    console.log("No pending migrations");
                    process.exit(0);
                }
            });
        else if (args.execute)
            return migrate().done(
                _ => process.exit(0),
                e => {
                    console.error(e.stack);
                    process.exit(1);
                });
        else if (args.rollback) {
            return undoLast().done(_ => process.exit(0), e => {
                if (e.message == 'No migrations available to rollback') {
                    console.error(e.message);
                } else {
                    console.error(e.stack);
                }
                process.exit(1);
            })
        }
        else if (args.drop) {
            return undoAll().done(_ => process.exit(0), e => {
                  if (e.message == 'No migrations available to rollback') {
                      console.error(e.message);
                  } else {
                      console.error(e.stack);
                  }
                  process.exit(1);
            })
        }
        console.error("Add a --check, --execute, --drop or --rollback argument");
        process.exit(1);
    }

    if (typeof tasks === 'string')
        loadFromPath(tasks);
    else
        tasks.forEach(task => defineMigration(task.name, task));

    return {run, check, migrate, drop: undoAll}
}
