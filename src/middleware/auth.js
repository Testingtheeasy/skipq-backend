const jwt = require('jsonwebtoken');
const verifyToken = (secret) => (req,res,next) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({error:'No token'});
  try { req.user = jwt.verify(auth.split(' ')[1], secret); next(); }
  catch { return res.status(401).json({error:'Invalid token'}); }
};
const requireAdmin = [verifyToken(process.env.JWT_ADMIN_SECRET||(()=>{throw new Error('JWT_ADMIN_SECRET not set')})()),
  (req,res,next) => req.user.role==='admin'?next():res.status(403).json({error:'Admin only'})];
const requireOwner = [verifyToken(process.env.JWT_SECRET||(()=>{throw new Error('JWT_SECRET not set')})()),
  (req,res,next) => req.user.role==='owner'?next():res.status(403).json({error:'Owner only'})];
const optionalCustomer = (req,res,next) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) { req.user=null; return next(); }
  try { req.user = jwt.verify(auth.split(' ')[1], process.env.JWT_SECRET); }
  catch { req.user=null; }
  next();
};
module.exports = { requireAdmin, requireOwner, optionalCustomer };
