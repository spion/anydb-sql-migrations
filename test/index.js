require('source-map-support').install()

var mig = require('../lib/index');
var anydbsql = require('anydb-sql');
var path = require('path');
var t = require('blue-tape');
var Promise = require('bluebird');

function mkBasicDB() {
    var db = anydbsql({
        url: 'sqlite3://',
        connections: 1
    });

    var user  = db.define({
        name: 'posts',
        columns: {
            id: {dataType: 'integer', primaryKey: true},
            name: {dataType: 'text'},
            accountId: {dataType: 'integer'}
        }
    });

    var account = db.define({
        name: 'accounts',
        columns: {
            id: {dataType: 'integer', primaryKey:true},
            name: {dataType: 'text'},
            credentials: {dataType: 'text'}
        }
    });

    var storage = db.define({
        name: 'storages',
        columns: {
            id: {dataType: 'integer', primaryKey:true},
            credentials:{dataType:'text'}
        }
    });
    return {db:db, storage: storage, account: account, user:user}
}

t.test('basic', function(t) {
    var db = mkBasicDB();
    console.log("Hmm");
    var m1 = {
        name: '001-basic',
        up: function(tx) {
            return db.user.create().execWithin(tx)
                .then(function() {
                    return db.account.create().execWithin(tx)
                }).then(function() {
                    return db.storage.create().execWithin(tx)
                });
        },
        down: function(tx) {
          return db.user.drop().execWithin(tx)
            .then(_ => db.account.drop().execWithin(tx))
            .then(_ => db.storage.drop().execWithin(tx))
        }
    };

    var m2 = {
        name: '002-storage-migrate',
        up: function(tx) {
            db.account.addColumn({
                name: 'storageId',
                dataType: 'integer'
            });

            return db.account.alter().addColumn(db.account.storageId).execWithin(tx).then(function() {
                return db.account.select().allWithin(tx);
            }).then(function(accs) {
                return Promise.all(accs.map(function(acc, id) {
                    return db.storage.insert({id: id+1, credentials: acc.credentials})
                        .execWithin(tx).then(function() {
                            return db.account.where({id:acc.id})
                                .update({storageId: id+1})
                                .execWithin(tx);
                        });
                }));
            }).then(function() {
              return Promise.resolve()
            });
        },
        down: () => {return Promise.resolve()}
    };

    var migc1 = mig.create(db.db, [m1]);
    var migc2 = mig.create(db.db, [m1, m2])

    return migc1.check(function(res) {
        t.equal(res.length, 1, 'should be 1 pending migration');
    }).then(function() {
        return migc1.migrate()
    }).then(function(res) {
        return migc1.check(function(res) {
            t.equal(res.length, 0, 'should be 0 pending migrations');
        });
    }).then(function() {
        return [db.account.insert({id: 1, name: 'hi', credentials: 'storage'}),
                db.user.insert({id: 1, name: 'hi', accountId: 1})].reduce(function(acc, q) {
                    return acc.then(function() { return q.exec(); });
                }, Promise.resolve());
    }).then(function() {
        return db.user.select().all().then(function(res) {
            t.equal(res.length, 1, "should have 1 user in db");
        });
    }).then(function() {
        console.log("Running the rest...");
        return migc2.migrate()
    }).then(function() {
        return db.storage.where({id: 1}).get().then(function(s) {
            t.equal(s.credentials, 'storage', 'should be successfully migrated');
        });
    }).then(function() {
        return migc2.drop()
    }).then(function() {
      db.storage.where({id: 1}).get()
      .then(_ => { throw new Error("Table should not exist") },
            e => t.ok(e.message, 'Expecting error trying to access storage table: ' + e.message))
    }).then(function() {
      return migc2.drop()
        .then(res => {console.log(res); throw new Error('Drop should not work on empty db')},
              e => t.ok(e.message, 'Expecting error trying to run drop on empty db: ' + e.message))
    })
});

