const { sendBadRequest } = require('../helpers/responseHelper');

const validateRequest = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body, { abortEarly: false });
    if (error) {
      const errors = error.details.map((d) => d.message);
      return sendBadRequest(res, 'Validation failed', errors);
    }
    next();
  };
};

module.exports = validateRequest;
