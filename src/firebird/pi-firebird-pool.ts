import { PiDatabasePool, PiDatabase, promisifyAll } from "@pomgui/database";
import { PiFirebirdDatabase } from "./pi-firebird-database";

export class PiFirebirdPool implements PiDatabasePool {
    private _pool: any/*Firebird.ConnectionPool*/;
    private _ID = 0;

    /**
     * @param options require('node-firebird').Options
     * @param size Pool size
     */
    constructor(options: object, size = 10) {
        this._pool = require('node-firebird').pool(size, options);
        promisifyAll(this._pool, ['get']);
    }

    get(): Promise<PiDatabase> {
        return this._pool.get()
            .then((db: any) => {
                if (!db._ID)
                    db._ID = ++this._ID;
                return new PiFirebirdDatabase(db)
            });
    }
}
