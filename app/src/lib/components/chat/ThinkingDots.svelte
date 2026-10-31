<!-- Katachi is thinking: three dots that rise in turn (still under reduced motion) -->
<span data-thinking-dots aria-hidden="true"><span></span><span></span><span></span></span>
<style>
  [data-thinking-dots] { display: inline-flex; gap: 3px; align-items: center; height: 12px; }
  [data-thinking-dots] span { width: 4px; height: 4px; border-radius: 50%; background: var(--accent); animation: katachi-think 1.2s ease-in-out infinite; }
  [data-thinking-dots] span:nth-child(2) { animation-delay: 0.18s; }
  [data-thinking-dots] span:nth-child(3) { animation-delay: 0.36s; }
  @keyframes katachi-think { 0%, 60%, 100% { transform: translateY(0); opacity: 0.4; } 30% { transform: translateY(-3px); opacity: 1; } }
</style>
