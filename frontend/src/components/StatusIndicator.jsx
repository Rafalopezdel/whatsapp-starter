/**
 * StatusIndicator Component
 * Shows visual status of a chat (bot_active, agent_intervening, idle)
 */
export default function StatusIndicator({ status, size = 'normal', showLabel = false }) {
  const configs = {
    bot_active: {
      color: 'bg-green-500',
      label: 'Bot',
      icon: '🤖'
    },
    agent_intervening: {
      color: 'bg-orange-500',
      label: 'Agente',
      icon: '👤'
    },
    idle: {
      color: 'bg-gray-400',
      label: 'Inactivo',
      icon: '⚪'
    }
  };

  const config = configs[status] || configs.idle;

  const dotSize = size === 'small' ? 'w-2 h-2' : 'w-3 h-3';

  if (showLabel) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className={`${dotSize} rounded-full ${config.color}`} />
        <span className="text-sm font-medium text-gray-700">
          {config.icon} {config.label}
        </span>
      </span>
    );
  }

  return (
    <span
      className={`${dotSize} rounded-full ${config.color}`}
      title={config.label}
    />
  );
}
