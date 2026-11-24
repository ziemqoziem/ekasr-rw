const { route } = require('./_lib/http');
const { izinUntuk, infoPeran } = require('./_lib/izin');

module.exports = route({
  GET: {
    auth: 'login',
    fn: async (req, res, user) => ({
      user: { username: user.username, nama: user.nama, role: user.role, rt: user.rt, izin: izinUntuk(user.role), role_nama: (infoPeran(user.role) || {}).nama || user.role, batas_rt: !!(infoPeran(user.role) || {}).batas_rt }
    })
  }
});
