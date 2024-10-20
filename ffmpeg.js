const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs')
const path = require('path')
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
//const ffmpegPath =  path.resolve(__dirname, 'node_modules/@ffmpeg-installer/win32-x64/ffmpeg.exe');
const ffprobePath = require('@ffprobe-installer/ffprobe').path;
//const ffprobePath =  path.resolve(__dirname, 'node_modules/@ffprobe-installer/win32-x64/ffprobe.exe');

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

// Manually check if the libraries exist
//console.log('FFmpeg Path:', ffmpegPath);
//console.log('FFprobe Path:', ffprobePath);

// Function to get the duration of a video
const getVideoMetadata = (filePath, callback) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) {
            return callback(err);
        }
        // Duration is in seconds
        const duration = metadata?.format?.duration;
        const codec = metadata.streams[0].codec_name;
        if (duration === undefined || codec === undefined) {
            return callback(new Error('Duration or codec not found in metadata'));
        }
        callback(null, { duration, codec });
    });
};

// Function to capture thumbnail of video
const captureThumbnail = (videoPath, thumbnailPath, timeInSeconds = 5, callback) => {
    ffmpeg(videoPath)
        .screenshots({
            timestamps: [timeInSeconds],
            filename: path.basename(thumbnailPath),
            folder: path.dirname(thumbnailPath),
            size: '1920x1080'
        })
        .on('end', () => {
            callback(null, thumbnailPath);
        })
        .on('error', (err) => {
            console.error('Error capturing thumbnail:', err);
            callback(err);
        });
}

// Function to change format and codec of video and save it in a new directory
const convertVideo = (inputPath, outputPath, currentFormat, currentCodec, newFormat, newCodec, callback) => {
    // Check if the current format and codec are the same as the requested output format and codec
    if (currentFormat.toLowerCase() === newFormat.toLowerCase()) {
        // If format and codec are the same, just copy the file
        fs.copyFile(inputPath, outputPath, (err) => {
            if (err) {
                console.error('Error copying file:', err);
                callback(err);
            } else {
                console.log('File format is correct and file copied.');
                callback(null, outputPath);
            }
        });
    } else {
        // Perform conversion
        ffmpeg(inputPath)
            .output(outputPath) // The output file path, including the file extension
            .format(newFormat.toLowerCase()) // Ensure format name is in lowercase
            .on('start', (commandLine) => {
                console.log('FFmpeg video reformat start:', commandLine);
            })
            .on('progress', (progress) => {
                console.log(`Processing: ${Math.round(progress.percent)}% done`);
            })
            .on('end', () => {
                console.log('Processing finished successfully.');
                callback(null, outputPath);
            })
            .on('error', (err) => {
                console.error('Error changing video format:', err);
                console.error('FFmpeg stderr:', err.stderr);
                callback(err);
            })
            .run();
    }
}


module.exports = {
    getVideoMetadata,
    captureThumbnail,
    convertVideo,
};