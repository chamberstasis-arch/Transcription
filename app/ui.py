APP_HTML = """<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Transcriptor</title>
  <style>
    body {
      min-height: 100vh;
      margin: 0;
      display: grid;
      place-items: center;
      background: #eef3ef;
      color: #17201b;
      font: 15px/1.5 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    main {
      width: min(520px, calc(100vw - 32px));
      border: 1px solid rgba(255, 255, 255, 0.8);
      border-radius: 18px;
      background: rgba(255, 255, 255, 0.72);
      box-shadow: 0 18px 50px rgba(23, 32, 27, 0.08);
      padding: 24px;
      backdrop-filter: blur(14px);
    }
    h1 {
      margin: 0 0 8px;
      font-size: 22px;
      letter-spacing: 0;
    }
    p {
      margin: 0 0 18px;
      color: #58635d;
    }
    a {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 42px;
      border-radius: 10px;
      background: #0f766e;
      color: white;
      padding: 0 14px;
      font-weight: 700;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <main>
    <h1>Transcriptor</h1>
    <p>La interfaz React se ejecuta en el servidor de desarrollo de Vite.</p>
    <a href="http://localhost:5173/">Abrir frontend</a>
  </main>
</body>
</html>
"""
