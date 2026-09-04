// Business-Impact Calculator Logic
document.addEventListener('DOMContentLoaded', () => {
  const calcForm = document.getElementById('impact-calculator-form');
  if (!calcForm) return;

  calcForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const domain = document.getElementById('calc-domain').value;
    const latency = parseFloat(document.getElementById('calc-latency').value);
    const traffic = parseInt(document.getElementById('calc-traffic').value);
    const aov = parseFloat(document.getElementById('calc-aov').value);
    const baseConversion = parseFloat(document.getElementById('calc-conversion').value) / 100;

    const latencyPenaltyMs = Math.max(0, latency - 150);
    const penaltyFactor = (latencyPenaltyMs / 100) * 0.035;
    
    const normalTransactions = traffic * baseConversion;
    const degradedConversion = Math.max(0, baseConversion * (1 - penaltyFactor));
    const actualTransactions = traffic * degradedConversion;
    const lostTransactions = normalTransactions - actualTransactions;
    const estimatedMonthlyLoss = lostTransactions * aov;

    document.getElementById('res-domain').textContent = domain;
    document.getElementById('loss-output').textContent = `$${estimatedMonthlyLoss.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} lost / month`;
    document.getElementById('breakdown-text').innerHTML = `With <span class="command">${latency}ms</span> latency from Nairobi, conversion suffers a <span class="command">${(penaltyFactor * 100).toFixed(1)}%</span> friction penalty (~${Math.round(lostTransactions)} dropped orders/mo).`;

    document.getElementById('calculator-results').style.display = 'block';
  });
});
