(() => {
  const PASSWORD = 'Beauty';
  const STORAGE_KEY = 'ms-site-unlocked';

  const gate = document.getElementById('password-gate');
  if (!gate) return;

  if (localStorage.getItem(STORAGE_KEY) === 'true') {
    gate.remove();
    return;
  }

  const form = document.getElementById('password-form');
  const input = document.getElementById('password-input');

  document.documentElement.style.overflow = 'hidden';
  setTimeout(() => input.focus(), 50);

  function unlock() {
    localStorage.setItem(STORAGE_KEY, 'true');
    document.documentElement.style.overflow = '';
    gate.classList.add('unlocked');
    setTimeout(() => gate.remove(), 700);
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (input.value === PASSWORD) {
      unlock();
      return;
    }
    input.value = '';
    input.classList.remove('shake');
    void input.offsetWidth; // restart the shake animation on repeated wrong guesses
    input.classList.add('shake');
  });
})();
