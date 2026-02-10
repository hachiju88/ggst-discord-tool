import dotenv from 'dotenv';
dotenv.config();

import { initDatabase, closeDatabase, getDatabase } from './index';

async function migrate() {
    try {
        console.log('Initializing database...');
        await initDatabase();
        const db = getDatabase();

        console.log('Correcting character names...');

        const corrections = [
            { old: 'ナゴリユキ', new: '名残雪' },
            { old: 'アンジー', new: '闇慈' },
            { old: 'バイケン', new: '梅喧' },
            { old: 'ハッピーカオス', new: 'ハッピーケイオス' }
        ];

        for (const correction of corrections) {
            console.log(`Updating ${correction.old} -> ${correction.new}...`);
            await db.execute({
                sql: 'UPDATE characters SET name = ? WHERE name = ?',
                args: [correction.new, correction.old]
            });
        }

        console.log('Character names corrected successfully.');

        await closeDatabase();
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

migrate();
