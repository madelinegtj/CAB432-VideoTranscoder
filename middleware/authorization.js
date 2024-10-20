const jwt = require('jsonwebtoken');

module.exports = function (req, res, next) {
    // check the headers for bearer token 
    if (!("authorization" in req.headers)
        || !req.headers.authorization.match(/^Bearer /))
    {
        res.status(401).json({ error: true, message: "Authorization header ('Bearer token') not found" });
        return;
    }

    // if bearer token is found, separate the "Bearer" text
    const getToken = req.headers.authorization.replace(/^Bearer /, "");
    
    // then decode the token with jwt.verify
    try {
        jwt.verify(getToken, process.env.JWT_SECRET);
        
    } catch (e) {
        console.log(e);
        if (e.name === "TokenExpiredError") {
            res.status(401).json({ error: true, message: "JWT token has expired" });
        } else {
            res.status(401).json({ error: true, message: "Invalid JWT token" });
        }
        return;
    }

    next();     // let the request through, i.e. continue handling the subsequent codes
};