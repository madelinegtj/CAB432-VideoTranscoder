const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Define the path to your SQLite database file
const dbPath = path.join(__dirname, 'userandvideo.db');

// Create and connect to SQLite3 database
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error connecting to the database:', err.message);
    } else {
        console.log('Connected to the SQLite database.');
    }
});


db.serialize(() => {
    // Create User table
    db.run(`
        CREATE TABLE IF NOT EXISTS User (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT NOT NULL,
            password TEXT NOT NULL
        )
    `);

    // Create Video table
    db.run(`
        CREATE TABLE IF NOT EXISTS Video (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            filename TEXT NOT NULL,
            filepath TEXT NOT NULL,
            mimetype TEXT NOT NULL,
            size INTEGER NOT NULL,
            duration INTEGER NOT NULL,
            author INTEGER NOT NULL,
            thumbnail TEXT, 
            codec TEXT,

            FOREIGN KEY (author) REFERENCES User(id)
        );
    `);

    // Function to clear the Video table
    const clearVideosTable = () => {
        db.run(`DELETE FROM Video`, function (err) {
            if (err) {
                console.error('Error clearing Video table:', err.message);
            } else {
                console.log(`Cleared ${this.changes} rows from Video table.`);
            }
        });
    };

    // Call the function to clear the Video table
    // clearVideosTable(); // Uncomment to clear table anytime
});

module.exports = db;
