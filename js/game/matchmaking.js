/**
 * ═══════════════════════════════════════════════════════
 * COLOR WARS — js/views/matchmaking.js
 * MULTIJUGADOR REAL CORREGIDO (ROSADO VS AZUL) + BOT
 * ═══════════════════════════════════════════════════════
 */
import { registerView, showToast } from '../core/app.js';
import { getProfile, setProfile, setView } from '../core/state.js';
import { getSupabase } from '../core/supabase.js';

registerView('matchmaking', initMatchmaking);

let _searchTimer = null;
let _countdownTimer = null;
let _matchChannel = null;   
let _currentMatchId = null; 

// La lista de 300 nombres venezolanos
const VZLA_NAMES = [
  "Adriana Colmenares", "La Catira", "La Flaca", "El Brayan", "Yuridia", "La Gocha", "El Chino", "Yulitza Uzcátegui",
  "El Menor", "La Chama", "Junior", "El Barbero", "Maikol Jackson", "La Doña", "El Gordo", "Yuleisi",
  "El Catire", "La Comadre", "Juancho", "El Mecánico", "Yurimar Pernía", "La Negra", "Wilmer", "Dayana Chacón",
  "El Brother", "El Cuñado", "Mariángel", "El Portugués", "Tibisay Quintero", "El Tío", "La Morocha", "El Kevin",
  "Xiomara Rangel", "El Chamo", "La Morena", "Yeison", "Zuleima Bastidas", "El Abuelo", "La Tía", "Josmer",
  "Karelys Sanguino", "El Gocho", "La Patrona", "Gladys Vielma", "El Pana", "Estefanía Arrieta", "El Negro", "Keila Chirinos",
  "La Niña", "Yorvis", "Yurubí Graterol", "El Chigüire", "Daniela Torrealba", "El Pelúo", "Milagros Machillanda", "El Chacal",
  "Norelys Zerpa", "La Prima", "Joselyn Monagas", "El Maracucho", "Oriana Guedez", "La Gorda", "Belkis Figueroa", "El Convive",
  "Yorgelis Palacios", "El Vigilante", "Magaly Betancourt", "Zulay Morillo", "La Doctora", "Indira Tovar", "El Socio", "Lisbeth Araujo",
  "El Pollo", "Mary Carmen Padrón", "La Teacher", "Yanitza Ledezma", "El Gato", "Dayerlin Infante", "La Baby", "Roxana Bencomo",
  "El Flaco", "Franyelis Mota", "El Jefe", "Deisy Altuve", "La Comadrita", "Nayarith Vizcaíno", "El Sobrino", "Jhoana Guédez",
  "La Cucha", "Mildred Seijas", "El Capo", "Solángel Malavé", "La Abuela", "Yamileth Guanipa", "El Mocho", "Luisa Amelia Farías",
  "La Jeva", "Ninoska Vallenilla", "El Musulmán", "Maryuri Agüero", "La Catirita", "Isabel Cristina Guevara", "El Pelao", "Rosaura Bermúdez",
  "La Ñema", "Aura Rosa Manrique", "El Manguera", "Thais Carrizo", "La Chuchu", "Leidys Oropeza", "El Ratón", "Marbella Lucena",
  "La Sirena", "Katiuska Amundaray", "El Oso", "Elvia Azuaje", "La Cuaima", "Reina Isabel Lugo", "El Tigre", "Mireya Antequera",
  "La Peque", "Dalia Henríquez", "El Burro", "Paola Valentina Silva", "La Reina", "Nellys Margarita Peña", "El Capitán", "Haydée Zambrano",
  "Yanetzi Barrios", "El Viejo", "Maigualida Márquez", "La Mami", "Doris Egleé Guerra", "El Papi", "Edicta Rivas", "Flor María Aranguren",
  "El Profe", "Irama Coromoto Paz", "El Abogado", "Judit Carvajal", "La Secretaria", "Katherine Villegas", "El Chofer", "Leonor Sánchez",
  "La Doñita", "Mirla Blanco", "El Bachaco", "Nancy Salazar", "El Caballo", "Olga Marina Díaz", "Petra Leonor Méndez", "Quiteria Rojas",
  "Rita Elena Pérez", "El Colector", "Saraí Mendoza", "El Pescador", "Teresa de Jesús Flores", "La Costurera", "Úrsula Rivero", "El Herrero",
  "Verónica García", "Wendy Josefina Torres", "El Pintor", "Xiorama Rodríguez", "El Carpintero", "Yaneth López", "El Albañil", "Zoila Martínez",
  "El Electricista", "Ana Karina Hernández", "La Enfermera", "Beatriz González", "El Bombero", "Carolina Ramírez", "La Policía", "Diana Morales",
  "El Sargento", "Elena Castillo", "La Teniente", "Fanny Medina", "El Coronel", "Gabriela Castro", "El General", "Hilda Romero",
  "El Alcalde", "Irene Herrera", "La Concejala", "Juana Álvarez", "La Vecina", "Karina Ruiz", "El Vecino", "Laura Suaréz",
  "Martha Ortega", "Nora Machado", "Olivia Prieto", "Patricia Urdaneta", "Raquel Boscán", "Silvia Parra", "Tatiana Nava", "Valeria Pirela",
  "Wilmarys Petit", "Yennyfer Oberto", "Zulay Guanipa", "Anabel Espina", "Brenda Valera", "Cecilia Molero", "Danna Rincón", "Erika Atencio",
  "Fiorella Godoy", "Gisela Luengo", "Heidy Mavárez", "Ivonne Camargo", "Jenny Chirinos", "Kelly Acurero", "Leslie Colina", "Mariela Ocando",
  "Neritza Montero", "Odalis Matos", "Prudencia Piña", "Rosiris Sierra", "Sandra Vivas", "Trina Chacín", "Viviana Mujica", "Yajaira Galué",
  "Zaida Vilchez", "Alba Nidia Rojas", "Berta Alarcón", "Clotilde Morán", "Dulce María Bello", "Enma Soto", "Felicia Vargas", "Gloria Estefan",
  "Herminia Prado", "Inés María Loyo", "Josefa Barrientos", "Ligia Elena Osorio", "Margot Freites", "Nohemí Landaeta", "Otilia Vielma", "Pastora Carullo",
  "Ramona Velásquez", "Sonia Graterol", "Teotiste Gallegos", "Virginia Loyo", "Yudith Cardozo", "El Yonaiker", "La Britany", "El Wuayoyo",
  "La Pelúa", "El Churro", "Josué", "El Malandro", "La Sifrina", "El Tukky", "Yosmar", "El Chacalito", "La Beba",
  "El Compadre", "Yorman", "El Cocho", "La Buchona", "El Chamo del agua", "Franklin", "El Cachicamo", "La Flaca de la esquina",
  "El Gordo del gas", "Jhonny", "El Menorcito", "La Chama de las uñas", "El Motorizado", "Yender", "La Catira de la bodega", "El Chamo del delivery",
  "Wilmer José", "La Señora de las empanadas", "El Chamo de la basura", "Darwin", "El Vendedor", "La Muchacha del banco", "El Guardia", "Yeferson",
  "La Miliciana", "El Colectivo", "Ender", "La Parilla", "El Chamo de la corneta", "Richard", "El Gordito", "La Chama del Instagram",
  "El Influencer", "Alirio", "El Youtuber", "Omar Enrique", "La Tiktoker", "Robinson", "El Gamer", "Oswaldo", "La Hacker",
  "Rubén Darío", "El Programador"
];

export async function initMatchmaking($container) {
  const profile = getProfile();
  if (!profile) { setView('auth'); return; }

  if (profile.wallet_bs < 200) {
    showToast('Saldo insuficiente. Necesitas 200 Bs.', 'error');
    setView('dashboard');
    return;
  }

  _currentMatchId = null;
  renderSearchScreen($container);
  startSearch($container, profile);
}

function renderSearchScreen($c) {
  $c.innerHTML = `
  <div class="mm-screen">
    <div style="display:flex; flex-direction:column; align-items:center; gap:2rem;">
      <div class="mm-ring"><span style="font-size:1.5rem;">⚔️</span></div>
      <div style="text-align:center;">
        <h2 style="font-family:var(--font-display); font-size:1.2rem; letter-spacing:0.2em; color:var(--text-bright); margin-bottom:0.5rem;">BUSCANDO RIVAL</h2>
        <p style="font-family:var(--font-mono); font-size:0.75rem; color:var(--text-dim); text-transform:uppercase;">Conectando con la arena...</p>
      </div>
      <button id="btn-cancel-search" class="btn btn-ghost" style="margin-top:2rem;">✕ CANCELAR</button>
    </div>
  </div>`;
  $c.querySelector('#btn-cancel-search').addEventListener('click', cancelSearch);
}

async function startSearch($c, profile) {
  const sb = getSupabase();

  try {
    // 1. Cobrar entrada por adelantado
    const newBalance = Number(profile.wallet_bs) - 200;
    await sb.from('users').update({ wallet_bs: newBalance }).eq('id', profile.id);
    setProfile({ ...profile, wallet_bs: newBalance });

    // 2. Buscar si alguien más está esperando en Supabase (Usamos profile.id, NO email)
    const { data: waitingMatch, error: searchErr } = await sb
      .from('matches')
      .select('*')
      .eq('status', 'waiting')
      .neq('player_pink', profile.id) // No unirse a sí mismo
      .limit(1)
      .maybeSingle();

    if (searchErr) throw searchErr;

    if (waitingMatch) {
      // 3A. ¡ENCONTRÉ A ALGUIEN! El que llega de segundo es el AZUL.
      await sb.from('matches').update({
        player_blue: profile.id,
        status: 'playing'
      }).eq('id', waitingMatch.id);

      window.CW_SESSION = {
        isBotMatch: false,
        matchId: waitingMatch.id,
        myColor: 'blue',
        rivalName: "HUMANO",
        board: Array(5).fill(null).map(() => Array(5).fill(null).map(() => ({ owner: null, mass: 0 })))
      };

      renderCountdownScreen($c, "HUMANO ENCONTRADO", "ERES EL AZUL - Juegas de segundo");
      startCountdown($c);

    } else {
      // 3B. NO HAY NADIE. Yo creo la sala, me toca ser el ROSADO y jugar de primero.
      const { data: newMatch, error: insertErr } = await sb.from('matches').insert([{
        player_pink: profile.id,
        status: 'waiting'
      }]).select().single();

      if (insertErr) throw insertErr;
      _currentMatchId = newMatch.id;

      // 4. Conectar el Cable de Supabase y sentarse a esperar
      _matchChannel = sb.channel(`match_${newMatch.id}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=eq.${newMatch.id}` }, (payload) => {
          if (payload.new.status === 'playing' && payload.new.player_blue !== 'BOT') {
            // ¡OTRO HUMANO ENTRÓ A MI SALA!
            clearTimeout(_searchTimer);
            sb.removeChannel(_matchChannel); 

            window.CW_SESSION = {
              isBotMatch: false,
              matchId: newMatch.id,
              myColor: 'pink',
              rivalName: "HUMANO",
              board: Array(5).fill(null).map(() => Array(5).fill(null).map(() => ({ owner: null, mass: 0 })))
            };

            renderCountdownScreen($c, "HUMANO ENCONTRADO", "ERES EL ROSADO - Empiezas tú");
            startCountdown($c);
          }
        })
        .subscribe();

      // 5. Encender reloj de 35 segundos para el Bot
      _searchTimer = setTimeout(() => {
        setupBotMatchFallback($c, profile);
      }, 35000);
    }
  } catch (err) {
    console.error("Error buscando partida:", err);
    showToast('Error de conexión', 'error');
    setView('dashboard');
  }
}

async function cancelSearch() {
  clearTimeout(_searchTimer);
  clearTimeout(_countdownTimer);
  
  const sb = getSupabase();
  const profile = getProfile();

  if (_matchChannel) {
    sb.removeChannel(_matchChannel);
  }

  // REEMBOLSO SI CANCELA MIENTRAS ESPERABA
  if (_currentMatchId) {
    try {
      const newBalance = Number(profile.wallet_bs) + 200; 
      await sb.from('users').update({ wallet_bs: newBalance }).eq('id', profile.id);
      setProfile({ ...profile, wallet_bs: newBalance });
      
      await sb.from('matches').update({ status: 'cancelled' }).eq('id', _currentMatchId);
    } catch(e) { console.error("Error reembolsando:", e); }
  }
  
  _currentMatchId = null;
  setView('dashboard');
}

// PLAN B: EL BOT VENEZOLANO
async function setupBotMatchFallback($c, profile) {
  const sb = getSupabase();
  if (_matchChannel) sb.removeChannel(_matchChannel);

  try {
    const { data: userData } = await sb.from('users').select('bot_next_win').eq('id', profile.id).single();
    const humanWinsNext = userData ? userData.bot_next_win : false; 
    
    await sb.from('users').update({ bot_next_win: !humanWinsNext }).eq('id', profile.id);
    
    const randomName = VZLA_NAMES[Math.floor(Math.random() * VZLA_NAMES.length)];
    if (_currentMatchId) {
      await sb.from('matches').update({
        player_blue: 'BOT',
        status: 'playing'
      }).eq('id', _currentMatchId);
    }

    window.CW_SESSION = {
      isBotMatch: true,
      botName: randomName,
      humanWinsNext: humanWinsNext, 
      myColor: 'pink',
      board: Array(5).fill(null).map(() => Array(5).fill(null).map(() => ({ owner: null, mass: 0 })))
    };

    renderCountdownScreen($c, randomName, "ERES EL ROSADO - Empiezas tú");
    startCountdown($c);
    
  } catch (err) {
    console.error("Error fallback bot:", err);
    setView('dashboard');
  }
}

function renderCountdownScreen($c, rivalName, instruction) {
  $c.innerHTML = `
  <div class="mm-screen">
    <div style="display:flex; flex-direction:column; align-items:center; gap:1.5rem;">
      <div style="width:180px; height:180px; border-radius:50%; border:2px solid var(--border-ghost); display:flex; align-items:center; justify-content:center; position:relative;">
        <span id="mm-count" class="mm-countdown">10</span>
      </div>
      <div style="text-align:center;">
        <h2 style="font-family:var(--font-display); font-size:1.4rem; color:var(--text-bright); margin-bottom:0.5rem;">¡RIVAL ENCONTRADO!</h2>
        <p style="color:var(--blue); font-weight:bold; font-size:1.2rem; text-transform:uppercase;">${rivalName}</p>
        <p style="color:var(--pink); font-size:0.9rem; margin-top:10px; font-weight:bold;">${instruction}</p>
      </div>
    </div>
  </div>`;
}

function startCountdown($c) {
  let count = 10;
  const $count = $c.querySelector('#mm-count');
  
  _countdownTimer = setInterval(() => {
    count--;
    if ($count) $count.textContent = count;

    if (count <= 0) {
      clearInterval(_countdownTimer);
      setView('game'); 
    }
  }, 1000);
}
