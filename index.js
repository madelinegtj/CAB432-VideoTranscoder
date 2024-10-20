// Building Video Converter Web Tutorial: https://www.youtube.com/watch?v=eVxSNDfjyOs
// Video converting functionalities are based on this tutorial
// However, other functionalities like Login, UI/UX, etc. are not

const express = require('express')
const path = require('path')    // Node JS dependency
const handbrake = require('handbrake-js')       // HandBrake uses FFmpeg
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');     // module for password hashing
const session = require('express-session');
const cookieParser = require('cookie-parser');
const multer = require('multer')    // file upload dependency in Express; lets you upload file
const fs = require('fs');

const app = express()

const authorization = require("./middleware/authorization"); 

const userController = require('./controllers/userController.js');
const videoController = require('./controllers/videoController.js');

// Define a static directory, where all the video file uploads are stored
app.use(express.static(path.join(__dirname, "public/uploads")));

// Middleware; fetch the data which is submitted through the form inside the ajax request
app.use(bodyParser.urlencoded({  extended: false }));
app.use(bodyParser.json());
app.use(express.static('public'));

app.use(cookieParser());

// require .env file to read variables from .env
// this will read our .env file contents and store all the variables in there in process.env
require("dotenv").config();
const JWT_SECRET = process.env.JWT_SECRET;
// Manage user login session
app.use(session({
    secret: JWT_SECRET,  // see .env file
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }  // Set secure to true in production when using HTTPS
}));

// In-memory user storage
//const users = [];

// Use ejs as the template engine
app.set('view engine', 'ejs')

//<--- implement multer config code for uploading single file --->
var storage = multer.diskStorage({
    destination: function(req, file, cb){
        cb(null, "public/uploads");
    },
    filename: function(req, file, cb){
        cb(null, 
           file.fieldname + "-" + Date.now() + path.extname(file.originalname)
        );
    },
});     // Assign Folder destination and Name to the uploaded file

const videoFilter = function(req, file, callback){
    var ext = path.extname(file.originalname);
    if(
        ext !== ".mp4" &&
        ext !== ".avi" &&
        ext !== ".flv" &&
        ext !== ".wmv" &&
        ext !== ".mov" &&
        ext !== ".mkv" &&
        ext !== ".gif" &&
        ext !== ".m4v"
    ){
        return callback(new Error("File format extension is not supported."));
    }
    callback(null, true); // Else/Otherwise, file format is accepted
};  // Validate the file extension on the server-side (as well), in case User has disabled JavaScript on the client-side

// 1 GB (1000 MB)
var maxSize = 1000 * 1024 * 1024;

var uploadVideo = multer({
    storage: storage,
    limits: {fileSize: maxSize},
    fileFilter: videoFilter,
}).single("file"); // referred to the form with "Select video:" label with attribute name="file"

//<--- end of file upload configuration using multer --->

// Serve static files from the "public" directory
app.use('/public', express.static(path.join(__dirname, 'public')));

//<--- Routes --->
// Home
app.get('/', (req,res)=> {
    // If user is logged in, redirect to main converter page (a protected route)
    if (req.session.userId) {
        res.redirect('/uploadvideo'); 
    }
    // Otherwise, ask user to login
    res.render('login', { error: null }) //rendering login.ejs file; error has to be defined all the time even when there is no error
});

// Login
/*
app.get('/login', (req,res)=> {
    res.render('login', { error: null }) //rendering login.ejs file; error has to be defined all the time even when there is no error
});

app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    // Find user by email
    const user = users.find(u => u.email === email);
    if (!user) {
        // The error display is formatted in the .ejs file (login.ejs)
        return res.render('login', { error: 'User not found. Please try again.' });
    }

    // Compare password with the hashed password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
        // The error display is formatted in the .ejs file (login.ejs)
        return res.render('login', { error: 'Incorrect password. Please try again.' });
    }

    // Save user session
    req.session.userId = user.id;
    res.redirect('/uploadvideo');
});

// Register
app.get('/register', (req,res)=> {
    res.render('register', { error: null }) //rendering register.ejs file; error has to be defined all the time even when there is no error
});

app.post('/register', async (req, res) => {
    const { username, email, password } = req.body;

    // Check if user already exists
    const existingUser = users.find(u => u.email === email);
    if (existingUser) {
        // The error display is formatted in the .ejs file (register.ejs)
        return res.render('register', { error: 'User already exists. Login instead.' });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Save new user to in-memory storage
    const newUser = {
        id: users.length + 1, // In a real app, use a database ID
        username,
        email,
        password: hashedPassword
    };
    users.push(newUser);

    // Log the user in automatically after registration
    req.session.userId = newUser.id;
    res.redirect('/login');
});

// Logout
app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.send('Error logging out. Try again.');
        }
        res.redirect('/');
    });
});

// Upload Video -> input
app.get('/uploadvideo', (req,res)=> {
    res.render('index') //rendering index.ejs file
});

app.post('/uploadvideo', (req,res) => {
    uploadVideo(req, res, (err) => {
        if (err){
            //console.log(err)
            return res.end("Error uploading file." + err);
        } 
        //Else/Otherwise, upload the video
        res.json({
            path: req.file.path
        });
    });
});

// Convert Video -> output; dynamic
app.post('/convertvideo', (req,res) => {
    console.log(req.body.path);

    output = Date.now() + "output." + req.body.format;

    const options = {
        input: path.resolve(__dirname, req.body.path),
        output: output,
        preset: "Very Fast 480p30", // or can ask for user's input for preset
    };

    handbrake.exec(options, function(err, stdout, stderr){
        if (err) throw err;
        console.log(stdout);

        res.json({
            path: output,
        });
    });
});

// Download Video
app.get('/download', (req,res) => {
    var pathoutput = req.query.path;
    console.log(pathoutput);
    var fullpath = path.join(__dirname, pathoutput);
    res.download(fullpath, (err) =>{
        if (err){
            fs.unlinkSync(fullpath);
            res.send(err);
        }
        fs.unlinkSync(fullpath);
    });
});
*/


// ==============================================================

// Route to register a new user
app.get('/register', (req,res)=> {
    res.render('register', { error: null }) //rendering register.ejs file; error has to be defined all the time even when there is no error
});

app.post('/register', userController.register_user);

// Route to login
app.get('/login', (req,res)=> {
    res.render('login', { error: null }) //rendering login.ejs file; error has to be defined all the time even when there is no error
});

app.post('/login', userController.login_user);

// Route to logout
app.post('/logout', userController.logout_user);

// Route to upload videos
app.get('/uploadvideo', (req,res)=> {
    res.render('index') //rendering index.ejs file
});

app.post('/uploadvideo', videoController.upload.single('files'), videoController.uploadVideo);

// Route to convert video
app.post('/convertvideo', videoController.convertVideo)

// Route to download video
app.post('/downloadvideo', videoController.downloadVideo)

// Route to get all the videos of a user
app.get('/json/video', videoController.authorVideo)     // Render authorVideo method that returns a JSON response

app.get('/video', (req, res) => {
    res.render('allvideos'); // Render allvideos.ejs page
});

//app.get('/video/:id', videoController.getVideo)

// Route to delete specific video
app.delete('/delete/:id', videoController.deleteVideo)


// Listen to port number 3000; default
app.listen(process.env.PORT || 3000, () => {
    console.log("App is listening on port 3000")
});

module.exports = app;

/*
Example of how to us Handbrake module
const options = {
    input: "something.avi",     // input filename
    output: "something.mp4",    // output filename
    preset: "Very Fast 1080p30",           // encoding speed
    rotate: 1,
};
handbrake.spawn(options).on("error", console.error).on("output", console.log);


const options = {
    input: Path2D.resolve(__dirname, req.body.path),
    output: output,
    preset: "Very Fast 1080p30", 
};

handbrake.exec(options, function(err,stdout,stderr){
    if (err) throw err;
    console.log(stdout);

    res.json({
        path: output,
    });
});
*/

// ejs as a template engine; express for server; multer is a dependency for uploading files