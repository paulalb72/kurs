import { useUI } from '../lib/ui';
import { Modal, ModalHead } from './Overlay';

export function MethodModal() {
  const close = useUI((s) => s.closeModal);
  return (
    <Modal onClose={close} label="So funktioniert Kurs" wide>
      <ModalHead eyebrow="Methode" title="So funktioniert Kurs" onClose={close} />
      <div className="modal-body prose">
        <p className="lead">
          Jahresziele, darunter Meilensteine und Gewohnheiten, dazu tägliche Aufgaben und zwei Rituale. Alles zahlt auf ein Ziel ein – und
          du siehst jederzeit, ob du auf Kurs bist.
        </p>

        <div className="levels">
          <div className="level">
            <span className="level-tag">Jahr</span>
            <div>
              <strong>Jahresziele</strong>
              <p>Höchstens drei Lebensbereiche, in denen sich dieses Jahr etwas bewegen soll – jeweils mit einem klaren Warum.</p>
            </div>
          </div>
          <div className="level">
            <span className="level-tag">4–12 Wochen</span>
            <div>
              <strong>Meilensteine</strong>
              <p>
                Konkrete, messbare Ergebnisse mit Deadline. Der Status vergleicht deinen Fortschritt mit der verstrichenen Zeit:
                „Auf Kurs“, „Gefährdet“ oder „Hinterher“.
              </p>
            </div>
          </div>
          <div className="level">
            <span className="level-tag">Jede Woche</span>
            <div>
              <strong>Gewohnheiten</strong>
              <p>
                Wiederkehrendes Verhalten mit Mindest-Wochenziel, z. B. 3× Training – mehr ist gut. Zahlt wie ein Meilenstein auf ein
                Jahresziel ein und wird über die letzten 4 Wochen und den ganzen Zeitraum bewertet.
              </p>
            </div>
          </div>
          <div className="level">
            <span className="level-tag">Tag</span>
            <div>
              <strong>Aufgaben</strong>
              <p>Der nächste konkrete Schritt – mit einem festen Tag, an dem du ihn erledigst.</p>
            </div>
          </div>
        </div>

        <h3>Rituale</h3>
        <div className="rituals">
          <div className="ritual-card">
            <strong>Tag planen · 5 Min</strong>
            <p>Am Vorabend oder morgens: drei Top-Aufgaben wählen. Erst die Top 3, dann der Rest.</p>
          </div>
          <div className="ritual-card">
            <strong>Wochenrückblick · 15 Min</strong>
            <p>Freitag bis Sonntag: Was lief gut, was nicht? Für jeden Meilenstein den nächsten Schritt festlegen und die Woche verplanen.</p>
          </div>
        </div>

        <h3>Warum das funktioniert</h3>
        <ul className="evidence">
          <li>
            <strong>Konkrete, fordernde Ziele</strong> führen zu besserer Leistung als ein vages „Gib dein Bestes“.{' '}
            <cite>Locke &amp; Latham, 2002</cite>
          </li>
          <li>
            <strong>Konkrete Wann- und Wenn-dann-Pläne</strong> (Implementation Intentions) erhöhen die Umsetzung deutlich – mittlerer bis
            großer Effekt über 94 Studien. Deshalb bekommt jeder Schritt einen Tag und jeder Meilenstein einen Wenn-dann-Plan.{' '}
            <cite>Gollwitzer &amp; Sheeran, 2006</cite>
          </li>
          <li>
            <strong>Fortschritt festhalten</strong> erhöht die Chance, ein Ziel zu erreichen – besonders, wenn er sichtbar notiert wird.{' '}
            <cite>Harkin et al., 2016 · 138 Studien</cite>
          </li>
          <li>
            <strong>Hindernisse vorwegnehmen</strong> und eine Wenn-dann-Reaktion festlegen wirkt besser als positives Denken allein.{' '}
            <cite>Oettingen, WOOP</cite>
          </li>
          <li>
            <strong>Gewohnheiten</strong> werden im Schnitt nach gut zwei Monaten automatisch, und ein ausgelassener Tag wirft den Prozess
            nicht zurück. Deshalb Wochenziele statt strenger Tagesketten. <cite>Lally et al., 2010</cite>
          </li>
          <li>
            <strong>Regelmäßige Reflexion</strong> verbessert messbar, wie gut man aus Erfahrung lernt. <cite>Di Stefano et al., 2014</cite>
          </li>
          <li>
            <strong>Wenige Prioritäten</strong> statt endloser Listen – ein bewährtes Praxisprinzip (Ivy-Lee-Methode), das die
            wichtigste Entscheidung des Tages vorwegnimmt.
          </li>
        </ul>
      </div>
    </Modal>
  );
}
