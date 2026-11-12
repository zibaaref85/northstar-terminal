const { json, authenticate, serviceRequest } = require('../../lib/server-security');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'POST' });
  try {
    const user = await authenticate(req);
    if (!user) return json(res, 401, { error: 'authentication_required' });
    const confirmation = String(req.body && req.body.confirmation || '');
    if (confirmation !== 'DELETE MY ACCOUNT') return json(res, 400, { error: 'explicit_confirmation_required' });
    await serviceRequest(`/auth/v1/admin/users/${encodeURIComponent(user.id)}`, { method: 'DELETE' });
    return json(res, 200, { deleted: true, message: 'Account and Northstar database rows were deleted.' });
  } catch (_) { return json(res, 503, { error: 'account_deletion_temporarily_unavailable' }); }
};
