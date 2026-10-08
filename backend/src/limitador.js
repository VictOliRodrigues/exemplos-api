// Limite simples de requisições por minuto (janela fixa, em memória).
// Protege a API de loops acidentais, ex.: um setInterval sem tempo ou um fetch dentro de um while.

const janelaMs = 60_000;
const contadores = new Map();

export function verificarLimite(chave, limitePorMinuto) {
  if (!limitePorMinuto) return { permitido: true };

  const agora = Date.now();
  let contador = contadores.get(chave);
  if (!contador || agora - contador.inicio >= janelaMs) {
    contador = { inicio: agora, total: 0 };
    contadores.set(chave, contador);
  }

  contador.total++;
  if (contador.total > limitePorMinuto) {
    const segundosRestantes = Math.ceil((contador.inicio + janelaMs - agora) / 1000);
    return { permitido: false, segundosRestantes };
  }
  return { permitido: true };
}

// Limpa contadores antigos para não acumular memória.
setInterval(() => {
  const agora = Date.now();
  for (const [chave, contador] of contadores) {
    if (agora - contador.inicio >= janelaMs) contadores.delete(chave);
  }
}, janelaMs).unref();
