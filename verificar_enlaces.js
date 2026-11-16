import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Inicializar Firebase Admin usando las variables de entorno de GitHub Actions
initializeApp({
  credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
});

const db = getFirestore();

async function verificarYLimpiar() {
    console.log("Iniciando verificación y limpieza automática de enlaces rotos...");
    
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
            try {
                // Comprobamos la metadata en Archive.org
                const response = await fetch(`https://archive.org/metadata/${id}`);
                
                // Si el servidor responde con error 404 o el álbum ya no existe
                if (!response.ok) {
                    reporteEliminados[categoria].push(id);
                    cambiosRealizados = true;
                    console.log(`🗑️ Enlace roto eliminado de '${categoria}': ${id}`);
                } else {
                    // El enlace funciona, lo mantenemos en la lista limpia
                    listaLimpia.push(id);
                }
            } catch (e) {
                reporteEliminados[categoria].push(id);
                cambiosRealizados = true;
                console.log(`🗑️ Error de red / Eliminado '${id}': ${e.message}`);
            }
        }

        // Actualizamos la categoría con la lista filtrada sin los rotos
        data[categoria] = listaLimpia;
    }

    // Si se ha eliminado algún álbum roto, guardamos los cambios de vuelta en Firestore
    if (cambiosRealizados) {
        await docRef.set(data);
        console.log("✅ Firestore actualizado con éxito. Se han eliminado los enlaces caídos.");
        console.log("Resumen de elementos eliminados:", JSON.stringify(reporteEliminados, null, 2));
    } else {
        console.log("✨ ¡Todo perfecto! No se encontró ningún enlace roto. La base de datos está intacta.");
    }

    process.exit(0);
}

verificarYLimpiar();