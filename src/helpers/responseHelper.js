const sendSuccess = (res, data, message = 'Success', statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
};

const sendError = (res, message = 'An error occurred', statusCode = 500, errors = null) => {
  const response = {
    success: false,
    message,
  };
  if (errors) response.errors = errors;
  return res.status(statusCode).json(response);
};

const sendNotFound = (res, message = 'Resource not found') => {
  return sendError(res, message, 404);
};

const sendBadRequest = (res, message = 'Bad request', errors = null) => {
  return sendError(res, message, 400, errors);
};

module.exports = { sendSuccess, sendError, sendNotFound, sendBadRequest };
