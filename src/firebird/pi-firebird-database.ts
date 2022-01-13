import { PiDatabase, QueryResult, promisifyAll } from "@pomgui/database";
import { Logger } from "sitka";

export class PiFirebirdDatabase extends PiDatabase {
    private _currTransac: any;

    constructor(private _db: any /* Firebird.Database */) {
        super();
        promisifyAll(this._db, ['detach', 'transaction', 'query']);
        this._logger = Logger.getLogger('DB#' + this.id);
    }

    get id(): number { return this._db._ID; }

    /** @override to accept iterators */
    escape(value: any): string {
        if (value !== null && value !== undefined && typeof value != 'string' && typeof value[Symbol.iterator] == 'function') {
            let result = '', first = true;
            for (const item of value) {
                if (!first) result += ','; else first = false;
                result += this.escape(item);
            }
            return result;
        } else
            return this._db.escape(value);
    }

    async close(): Promise<void> {
        /* istanbul ignore else  */
        if (this._db.connection._isOpened)
            return this._db.detach();
    }

    beginTransaction(): Promise<void> {
        return this._db.transaction(null)
            .then((t: any) => {
                promisifyAll(this._currTransac = t, ['commit', 'rollback', 'query']);
            });
    }

    commit(): Promise<void> {
        return this._currTransac.commit()
            .then(() => {
                this._logger.debug('committed');
                delete this._currTransac;
            });
    }

    rollback(): Promise<void> {
        if (this._currTransac)
            return this._currTransac.rollback()
                .then(() => {
                    this._logger.debug('rollback');
                    delete this._currTransac;
                });
        else
            return Promise.reject('No transaction to rollback');
    }

    protected _executeQuery(sql: string, params: any[]): Promise<QueryResult> {
        sql = transformLimitToRows(sql);
        const dbObj = this._currTransac || this._db;
        const type = /\w+/.exec(sql)![0].toLowerCase();
        return dbObj.query(sql, params)
            .then((result: any) => {
                switch (type) {
                    case 'select':
                        return { rows: result };
                    case 'insert':
                    case 'update':
                    case 'delete':
                        return { affectedRows: 1, rows: result && [result] };
                    default:
                        return result &&
                            /* istanbul ignore next */
                            { rows: result };
                }
            });
    }
}

/**
 * If the SQL contains {LIMIT offset,size} (mysql syntax), it will be converted to
 * {ROWS offset TO offset+size-1} (Firebird/SQL Standard)
 */
function transformLimitToRows(sql: string): string {
    return sql.replace(/LIMIT\s+(\d+)\s*,\s*(\d+)/gi, (g, offset, size) =>
        'ROWS ' + ((offset >> 0) + 1) + ' TO ' + ((offset >> 0) + (size >> 0))
    )
}
