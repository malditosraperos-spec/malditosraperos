import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Inicializar Firebase Admin usando las variables de entorno de GitHub Actions
initializeApp({
  credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
});

const db = getFirestore();

async function verificarYLimpiar() {
    console.log("Iniciando verificación avanzada y limpieza de enlaces de la radio...");
    
    const docRef = db.collection("config").doc("radio");
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
        console.error("No se encontró el documento 'config/radio' en Firestore.");
        process.exit(1);
    }

    const data = docSnap.data();
    let cambiosRealizados = false;
    let reporteEliminados = {};

    for (const categoria in data) {
        reporteEliminados[categoria] = [];
        const listaOriginal = data[categoria] || [];
        const listaLimpia = [];

        console.log(`Revisando categoría: ${categoria} (${listaOriginal.length} álbumes)...`);

        for (const id of listaOriginal) {
            let estaRoto = false;
            try {
                const response = await fetch(`https://archive.org/metadata/${id}`);
                
                if (!response.ok) {
                    estaRoto = true;
                } else {
                    const json = await response.json();
                    
                    // Comprobación 1: Si Archive.org devuelve un mensaje de que ya no está disponible
                    if (json.is_dark || json.error || (json.metadata && json.metadata.title === "Item Not Available")) {
                        estaRoto = true;
                    } else {
                        // Comprobación 2: Ver si realmente tiene archivos .mp3 válidos dentro
                        const files = json.files || [];
                        const mp3s = files.filter(f => f.name && f.name.toLowerCase().endsWith('.mp3') && !f.name.toLowerCase().includes('vbr'));
                        
                        if (mp3s.length === 0) {
                            // Si no tiene canciones mp3, el álbum está vacío o inservible para la radio
                            estaRoto = true;
                        }
                    }
                }

                if (estaRoto) {
                    reporteEliminados[categoria].push(id);
                    cambiosRealizados = true;
                    console.log(`🗑️ Enlace roto o vacío eliminado de '${categoria}': ${id}`);
                } else {
                    listaLimpia.push(id);
                }
            } catch (e) {
                reporteEliminados[categoria].push(id);
                cambiosRealizados = true;
                console.log(`🗑️ Error analizando '${id}': ${e.message}`);
            }
        }

        // Actualizamos la categoría con la lista filtrada
        data[categoria] = listaLimpia;
    }

    // Guardar cambios en Firestore si se ha borrado algo
    if (cambiosRealizados) {
        await docRef.set(data);
        console.log("✅ Firestore actualizado con éxito. Enlaces rotos o sin música eliminados.");
        console.log("Resumen de elementos eliminados:", JSON.stringify(reporteEliminados, null, 2));
    } else {
        console.log("✨ ¡Todo perfecto! Todos los enlaces tienen música disponible.");
    }

    process.exit(0);
}

verificarYLimpiar();