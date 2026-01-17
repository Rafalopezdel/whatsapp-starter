import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Hook to listen to active handoffs in real-time from Firestore
 * Returns a map of clientId -> handoff object for easy lookup
 */
export function useFirestoreHandoffs() {
  const [handoffs, setHandoffs] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    try {
      // Create query for active handoffs only
      const q = query(
        collection(db, 'open-handoffs'),
        where('status', '==', 'active')
      );

      // Subscribe to real-time updates
      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const handoffsMap = {};

          snapshot.docs.forEach(doc => {
            const data = doc.data();
            handoffsMap[data.clientId] = {
              id: doc.id,
              clientId: data.clientId,
              agentPhoneNumber: data.agentPhoneNumber,
              clientName: data.clientName || 'Cliente',
              status: data.status,
              createdAt: data.createdAt?.toDate() || new Date(),
              lastMessage: data.lastMessage?.toDate() || new Date(),
              closedAt: data.closedAt?.toDate() || null
            };
          });

          setHandoffs(handoffsMap);
          setLoading(false);
        },
        (err) => {
          console.error('Error listening to handoffs:', err);
          setError(err.message);
          setLoading(false);
        }
      );

      // Cleanup subscription on unmount
      return () => unsubscribe();
    } catch (err) {
      console.error('Error setting up handoffs listener:', err);
      setError(err.message);
      setLoading(false);
    }
  }, []);

  return { handoffs, loading, error };
}
