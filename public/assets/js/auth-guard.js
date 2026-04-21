(async function() {
  const token = localStorage.getItem('archive_token');
  if (!token) { window.location.href = '/index.html'; return; }
  try {
    const data = await api.get('/api/auth/me');
    window.currentUser = data.user;
    document.dispatchEvent(new CustomEvent('userLoaded', { detail: data.user }));
  } catch {
    window.location.href = '/index.html';
  }
})();
