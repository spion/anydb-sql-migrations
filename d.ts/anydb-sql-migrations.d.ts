declare module "anydb-sql-migrations" {
import Promise = require('bluebird');
import { Column, Table, Transaction, AnydbSql } from 'anydb-sql';
export interface Migration {
    version: string;
}
export interface MigrationsTable extends Table<Migration> {
    version: Column<string>;
}
export interface MigFn {
    (tx: Transaction): Promise<any>;
}
export interface MigrationTask {
    up: MigFn;
    down: MigFn;
    name: string;
}
export function create(db: AnydbSql, tasks: any): {
    run: () => Promise<any>;
    migrateTo: (target?: string) => Promise<any>;
    check: (f: (m: {
        type: string;
        items: MigrationTask[];
    }) => any) => Promise<any>;
};
}
