declare module "anydb-sql-migrations" {
import anydbSQL = require('anydb-sql');
import Promise = require('bluebird');
export interface Migration {
    version: string;
}
export interface MigrationsTable extends anydbSQL.Table<Migration> {
    version: anydbSQL.Column<string>;
}
export interface MigFn {
    (tx: anydbSQL.Transaction): Promise<any>;
}
export interface MigrationTask {
    up: MigFn;
    down: MigFn;
    name: string;
}
export function create(db: anydbSQL.AnydbSql, tasks: any): {
    run: () => Promise<any>;
    migrateTo: (target?: string) => Promise<any>;
    check: (f: (m: {
        type: string;
        items: MigrationTask[];
    }) => any) => Promise<any>;
};
}
