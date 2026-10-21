import {createHash} from 'node:crypto';
import {validateDataset} from './model.mjs';

// Published datasets are immutable. Corrections require a new version; older
// snapshots remain available to reproduce an earlier result.
export function installDataset(db,dataset){
 validateDataset(dataset);
 const payload=JSON.stringify(dataset),hash=createHash('sha256').update(payload).digest('hex');
 if(!/^\d{4}-\d{2}-\d{2}\.[a-z0-9-]+$/.test(dataset.version))throw new Error('Invalid tariff dataset version');
 db.exec('CREATE TABLE IF NOT EXISTS denki_datasets(version TEXT PRIMARY KEY,sha256 TEXT NOT NULL,payload TEXT NOT NULL,imported_at TEXT NOT NULL)');
 const old=db.prepare('SELECT sha256 FROM denki_datasets WHERE version=?').get(dataset.version);
 if(old&&old.sha256!==hash)throw new Error('A published tariff version cannot be overwritten');
 if(!old)db.prepare('INSERT INTO denki_datasets VALUES(?,?,?,?)').run(dataset.version,hash,payload,new Date().toISOString());
 return {...dataset,sha256:hash};
}
export function readDataset(db,version){
 const row=db.prepare('SELECT payload,sha256 FROM denki_datasets WHERE version=?').get(version);
 return row?{...JSON.parse(row.payload),sha256:row.sha256}:null;
}
