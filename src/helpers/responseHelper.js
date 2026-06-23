function sendSuccess(res, data, message = 'Success', statusCode = 200) {
  return res.status(statusCode).json({ success: true, data, message });
}

function sendError(res, message = 'Error', statusCode = 500) {
  return res.status(statusCode).json({ success: false, message });
}

function sendNotFound(res, message = 'Not Found') {
  return res.status(404).json({ success: false, message });
}

module.exports = { sendSuccess, sendError, sendNotFound };