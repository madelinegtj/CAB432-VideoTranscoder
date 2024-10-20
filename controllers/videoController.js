const path = require('path');
const jwt = require('jsonwebtoken');
const VideoModel = require('../models/video');  
const ffmpeg = require('../ffmpeg');
const multer = require('multer') ;  // File upload dependency
const fs = require('fs');

require("dotenv").config();
const JWT_SECRET = process.env.JWT_SECRET;

// Set up Multer for handling file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, '..', 'public/uploads'));
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname);
    }
});
const upload = multer({ storage }); //multer middleware to handle upload between front and back end

const uploadVideo = async (req, res) => {
    if(!req.file){
        return res.status(400).json({ message: 'No files were uploaded'});
    }

    const file = req.file;
    const uploadPath = file.path;
    const thumbnailPath = path.join(__dirname, '..', 'public/thumbnails', `${path.basename(file.originalname, path.extname(file.originalname))}.png`);

    // Create uploads directory if it does not exist
    if(!fs.existsSync(path.dirname(uploadPath))){
        fs.mkdirSync(path.dirname(uploadPath), { recursive: true });
    }

    if (!fs.existsSync(path.dirname(thumbnailPath))) {
        fs.mkdirSync(path.dirname(thumbnailPath), { recursive: true });
    }

    // Generate URLs for accessing files
    const fileUrl = `/uploads/${file.originalname}`;
    const thumbnailUrl = `/thumbnails/${path.basename(thumbnailPath)}`;

    try {
        // Extract author from JWT
        const token = req.cookies.token;

        if (!token) {
            return res.status(401).send('No token provided');
        }

        jwt.verify(token, JWT_SECRET, async (err, user) => {
            if (err) return res.status(401).json({ message: 'Invalid token' });

            // Get video metadata using ffmpeg
            ffmpeg.getVideoMetadata(uploadPath, (err, metadata) => {
                if (err) {
                    return res.status(500).json({ message: 'Error getting video metadata', error: err });
                }

                // Capture thumbnail
                ffmpeg.captureThumbnail(uploadPath, thumbnailPath, 5, (thumbnailErr, thumbnail) => {
                    if (thumbnailErr) {
                        return res.status(500).json({ message: 'Error capturing thumbnail', error: thumbnailErr });
                    }

                    // Create video metadata
                    const video = {
                        title: file.originalname,
                        filename: file.originalname,
                        filepath: fileUrl,
                        mimetype: file.mimetype,
                        size: file.size,
                        duration: metadata.duration || 0,
                        author: user.userID, // Extracted from JWT
                        thumbnail: thumbnailUrl,
                        codec: metadata.codec
                    };

                    // Save video metadata to database
                    VideoModel.addVideo(video, (err, videoID) => {
                        if (err) {
                            console.error(err);
                            return res.status(500).json({ message: 'Failed to save video metadata', error: err });
                        }

                        res.status(200).json({ message: 'File uploaded and metadata saved', videoID, metadata: video });
                    });
                });
            });
        });
    } catch (error) {
        res.status(500).json({ message: 'An error occurred during the upload process', error });
    }
};

const authorVideo = (req, res) => {
    let token = req.cookies.token; 

    if (!token) {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
    
        token = authHeader.split(' ')[1]; // Extract the token from the 'Bearer <token>' format
    }

    // Decode the JWT to get the authorId
    let authorID;
    try {
        const decoded = jwt.verify(token, JWT_SECRET); // Replace 'your_secret_key' with your actual secret key
        authorID = decoded.userID; // Assuming the authorId is stored in the token payload
    } catch (err) {
        return res.status(401).json({ error: 'Invalid token' });
    }
  
    // Call the model function to get videos by the author
    VideoModel.getVideosByAuthor(authorID, (err, videos) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        // Send the retrieved videos as JSON response
        res.status(200).json(videos); 
        //return res.status(200).render('allvideos', { videos });     //render allvideos.ejs
    });
}

const getVideo = (req, res) => {
    const videoId = req.params.id;

    VideoModel.getVideoById(videoId, (err, video) => {
        if (err) {
            return res.status(500).json({ message: 'Server error', error: err.message });
        }

        if (!video) {
            return res.status(404).json({ message: 'Video not found' });
        }

        res.json(video);
    })
}

// Delete a video of specific id
const deleteVideo = (req, res) => {
    const videoId = req.params.id;

    VideoModel.getVideoById(videoId, (err, video) => { // Assuming you have a method to get video metadata
        if (err) {
            console.error('Error fetching video:', err);
            return res.status(500).json({ message: 'Server error', error: err.message });
        }

        console.log('Video object:', video);

        if (!video || !video[0] || !video[0].filename) {
            console.log('Video not found or missing metadata');
            return res.status(404).json({ message: 'Video not found or missing metadata' });
        }

        const videoPath = path.join(__dirname, '..', 'public/uploads', video[0].filename);
        const thumbnailPath = path.join(__dirname, '..', 'public/thumbnails', `${path.basename(video[0].filename, path.extname(video[0].filename))}.png`);

        // Delete the video file and thumbnail
        fs.unlink(videoPath, (err) => {
            if (err) {
                console.error('Failed to delete video file:', err);
                return res.status(500).json({ message: 'Failed to delete video file', error: err.message });
            }

            fs.unlink(thumbnailPath, (err) => {
                if (err) {
                    console.error('Failed to delete thumbnail file:', err);
                    return res.status(500).json({ message: 'Failed to delete thumbnail file', error: err.message });
                }

                // Proceed to delete the video metadata
                VideoModel.deleteVideo(videoId, (err, wasDeleted) => {
                    if (err) {
                        console.error('Error deleting video metadata:', err);
                        return res.status(500).json({ message: 'Server error', error: err.message });
                    }

                    if (!wasDeleted) {
                        console.log('Video not found');
                        return res.status(404).json({ message: 'Video not found' });
                    }

                    console.log('Video deleted successfully');
                    res.status(200).json({ message: 'Video deleted successfully' });
                });
            });
        });
    });
};

const convertVideo = (req, res) => {
    console.log('Request body:', req.body);
    const { format: newFormat, codec: newCodec, videoData } = req.body;
    const format = getFormatFromMimeType(videoData.mimetype);

    if (!newFormat || !newCodec || !videoData || !videoData.filepath || !format || !videoData.codec) {
        return res.status(400).json({ message: 'Missing required parameters.' });
    }

    // Use the filepath directly from videoData
    const inputPath = path.join(__dirname, '..', 'public', videoData.filepath);
    const outputDirectory = path.join(__dirname, '..', 'public/outputs');
    const outputFilename = `${path.basename(videoData.filename, path.extname(videoData.filename))}.${newFormat}`;
    const outputPath = path.join(outputDirectory, outputFilename);

    // Ensure the output directory exists
    if (!fs.existsSync(outputDirectory)) {
        fs.mkdirSync(outputDirectory, { recursive: true });
    }

    // Call ffmpeg.reformatVideo with the parameters
    ffmpeg.convertVideo(
        inputPath,
        outputPath,
        format,
        videoData.codec,
        newFormat,
        newCodec,
        (err, outputPath) => {
            if (err) {
                return res.status(500).json({ message: 'Error reformatting video', error: err });
            }
            //res.status(200).json({ message: 'Video reformatted successfully', outputPath });
        }
    );
};

// Define a mapping of MIME types to file formats
const mimeTypeToFormat = {
    'video/mp4': 'mp4',
    'video/avi': 'avi',
    'video/x-flv': 'flv',
    'video/gif': 'gif',
    'video/m4v': 'm4v',
    'video/quicktime': 'mov'
};

// Function to get the format from MIME type
const getFormatFromMimeType = (mimeType) => {
    return mimeTypeToFormat[mimeType] || null; // Default to 'unknown' if MIME type is not found
};

// Function to download video
const downloadVideo = (req, res) => {
    const outputDirectory = path.join(__dirname, '..', 'public/outputs');

    // Ensure the output directory exists
    if (!fs.existsSync(outputDirectory)) {
        fs.mkdirSync(outputDirectory, { recursive: true });
    }

    fs.readdir(outputDirectory, (err, files) => {
        if (err) {
            return res.status(500).json({ message: 'Error reading target directory', error: err });
        }

        // Filter for video files based on possible extensions
        const videoFile = files.find(file => Object.values(mimeTypeToFormat).some(ext => file.endsWith(`.${ext}`)));

        if (!videoFile) {
            return res.status(404).json({ message: 'No video file found in the output directory' });
        }

        const filePath = path.join(outputDirectory, videoFile);

        // Extract the MIME type from the file extension
        const fileExtension = path.extname(videoFile).substring(1); // Get file extension without the dot
        const mimeType = Object.keys(mimeTypeToFormat).find(key => mimeTypeToFormat[key] === fileExtension);

        if (!mimeType) {
            return res.status(415).json({ message: 'Unsupported video file format' });
        }

        // Set the Content-Type header based on the MIME type
        res.setHeader('Content-Type', mimeType);

        // Use res.download to send the file to the client with the correct filename
        res.download(filePath, videoFile, (err) => {
            if (err) {
                return res.status(500).json({ message: 'Error downloading video file', error: err });
            }

            // Optionally delete the file after download
            fs.unlink(filePath, (err) => {
                if (err) {
                    console.error('Error deleting video file:', err);
                }
            });
        });
    });
};

module.exports = {
    upload,
    uploadVideo,
    authorVideo,
    getVideo,
    deleteVideo,
    convertVideo,
    downloadVideo,
}