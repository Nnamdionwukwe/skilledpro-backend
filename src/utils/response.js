export const sendResponse = (res, { status = 200, success = true, message = '', data = null }) => {
  return res.status(status).json({
    success,
    message,
    ...(data !== null && { data }),
  });
};

export const sendError = (res, message = 'Something went wrong', status = 500) => {
  return res.status(status).json({ success: false, message });
};
