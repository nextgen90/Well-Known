function adminMiddleware(req, res, next) {
    if (!req.user || req.user.role !== 'admin') {
        return res.redirect('/dashboard?error=Unauthorized admin access');
    }
    next();
}

module.exports = adminMiddleware;
