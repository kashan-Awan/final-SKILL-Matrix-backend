const jwt = require('jsonwebtoken');
const { getPool, sql } = require('../config/db');
const { sendError } = require('../helpers/responseHelper');

const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // #region agent log
      fetch('http://127.0.0.1:7378/ingest/353ef36c-6a32-456e-a37d-4222e72b6aca',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'89e245'},body:JSON.stringify({sessionId:'89e245',runId:'employee-debug',hypothesisId:'E',location:'requireAuth.js:noHeader',message:'Missing auth header',data:{hasHeader:!!authHeader},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      return sendError(res, 'Authentication required', 401);
    }
    const token = authHeader.split(' ')[1];
    if (!process.env.JWT_SECRET) {
      console.error('JWT_SECRET is not defined');
      return sendError(res, 'Server configuration error', 500);
    }
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return sendError(res, 'Invalid or expired token', 401);
    }
    if (!decoded || !decoded.id) {
      return sendError(res, 'Invalid token structure', 401);
    }
    const userId = decoded.id;
    const pool = await getPool();
    const result = await pool
      .request()
      .input('id', sql.NVarChar, userId)
      .query(`
        SELECT _id, employeeId, role, departmentId, is_deleted 
        FROM dawlance_user 
        WHERE _id = @id
      `);
    if (!result.recordset.length || result.recordset[0].is_deleted) {
      // #region agent log
      fetch('http://127.0.0.1:7378/ingest/353ef36c-6a32-456e-a37d-4222e72b6aca',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'89e245'},body:JSON.stringify({sessionId:'89e245',runId:'pre-fix',hypothesisId:'E',location:'requireAuth.js:dbLookup',message:'Auth middleware user lookup failed',data:{userFound:result.recordset.length>0,isDeleted:result.recordset[0]?.is_deleted??null,decodedIdLength:(decoded.id||'').length},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      return sendError(res, 'User not found or inactive', 401);
    }
    const user = result.recordset[0];
    // #region agent log
    fetch('http://127.0.0.1:7378/ingest/353ef36c-6a32-456e-a37d-4222e72b6aca',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'89e245'},body:JSON.stringify({sessionId:'89e245',runId:'pre-fix',hypothesisId:'E',location:'requireAuth.js:success',message:'Auth middleware passed',data:{role:(user.role||'').trim().toLowerCase(),hasDepartmentId:!!user.departmentId},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    req.user = {
      id: (user._id || '').toString().trim(),
      employeeId: (user.employeeId || '').toString().trim(),
      role: (user.role || '').toString().trim(),
      departmentId: user.departmentId
    };
    next();
  } catch (err) {
    console.error('requireAuth error:', err);
    return sendError(res, 'Authentication failed', 500);
  }
};

module.exports = { requireAuth };