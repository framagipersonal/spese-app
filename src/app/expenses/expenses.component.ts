import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Category, Expense, MonthlyTotal, SupabaseService } from '../supabase.service';

const today = () => new Date().toISOString().slice(0, 10);

@Component({
  selector: 'app-expenses',
  imports: [FormsModule, CurrencyPipe, DatePipe],
  template: `
    <header class="bar">
      <h1>Spese</h1>
      <span class="muted">{{ sb.session()?.user?.email }}</span>
      <button class="link" (click)="logout()">Esci</button>
    </header>

    <main>
      <!-- Nuova spesa -->
      <section class="card">
        <h2>Nuova spesa</h2>
        <form class="grid" (ngSubmit)="add()" #f="ngForm">
          <label>Importo (€)
            <input type="number" name="amount" [(ngModel)]="form.amount" min="0.01" step="0.01" required />
          </label>
          <label>Data
            <input type="date" name="spent_on" [(ngModel)]="form.spent_on" required />
          </label>
          <label>Categoria
            <select name="category_id" [(ngModel)]="form.category_id">
              <option [ngValue]="null">—</option>
              @for (c of categories(); track c.id) {
                <option [ngValue]="c.id">{{ c.name }}</option>
              }
            </select>
          </label>
          <label>Nota
            <input type="text" name="note" [(ngModel)]="form.note" maxlength="200" />
          </label>
          <label>Scontrino (facoltativo)
            <input type="file" accept="image/*,application/pdf" (change)="onFile($event)" />
          </label>
          <button type="submit" [disabled]="saving() || !f.valid">{{ saving() ? 'Salvo…' : 'Aggiungi' }}</button>
        </form>
        @if (error()) {
          <p class="error">{{ error() }}</p>
        }
      </section>

      <!-- Mese selezionato -->
      <section class="card">
        <div class="bar">
          <h2>Riepilogo</h2>
          <input type="month" [ngModel]="month()" (ngModelChange)="changeMonth($event)" />
        </div>

        <p class="total">Totale: <strong>{{ grandTotal() | currency: 'EUR' }}</strong></p>

        @for (t of totals(); track t.category) {
          <div class="row-bar">
            <span>{{ t.category }}</span>
            <div class="track"><div class="fill" [style.width.%]="(t.total / maxTotal()) * 100"></div></div>
            <span class="num">{{ t.total | currency: 'EUR' }}</span>
          </div>
        } @empty {
          <p class="muted">Nessuna spesa in questo mese.</p>
        }
      </section>

      <section class="card">
        <h2>Movimenti</h2>
        <table>
          <tbody>
            @for (e of expenses(); track e.id) {
              <tr>
                <td>{{ e.spent_on | date: 'dd/MM' }}</td>
                <td>{{ e.categories?.name ?? '—' }}</td>
                <td>{{ e.note }}</td>
                <td class="num">{{ e.amount | currency: 'EUR' }}</td>
                <td class="actions">
                  @if (e.receipt_path) {
                    <button class="link" (click)="openReceipt(e)">scontrino</button>
                  }
                  <button class="link danger" (click)="remove(e)">elimina</button>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </section>
    </main>
  `,
})
export class ExpensesComponent implements OnInit {
  protected readonly sb = inject(SupabaseService);
  private readonly router = inject(Router);

  readonly month = signal(today().slice(0, 7)); // 'YYYY-MM'
  readonly categories = signal<Category[]>([]);
  readonly expenses = signal<Expense[]>([]);
  readonly totals = signal<MonthlyTotal[]>([]);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  readonly grandTotal = computed(() => this.totals().reduce((sum, t) => sum + Number(t.total), 0));
  readonly maxTotal = computed(() => Math.max(1, ...this.totals().map((t) => Number(t.total))));

  form = this.emptyForm();
  private receipt: File | null = null;

  async ngOnInit() {
    this.categories.set(await this.sb.categories());
    await this.reload();
  }

  async changeMonth(month: string) {
    if (!month) return;
    this.month.set(month);
    await this.reload();
  }

  onFile(event: Event) {
    this.receipt = (event.target as HTMLInputElement).files?.[0] ?? null;
  }

  async add() {
    if (!this.form.amount) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.sb.addExpense(
        {
          amount: this.form.amount,
          spent_on: this.form.spent_on,
          category_id: this.form.category_id,
          note: this.form.note || null,
        },
        this.receipt,
      );
      this.form = this.emptyForm();
      this.receipt = null;
      await this.reload();
    } catch (e: any) {
      this.error.set(e.message ?? String(e));
    } finally {
      this.saving.set(false);
    }
  }

  async remove(e: Expense) {
    if (!confirm('Eliminare questa spesa?')) return;
    await this.sb.deleteExpense(e);
    await this.reload();
  }

  async openReceipt(e: Expense) {
    const win = window.open('', '_blank'); // aperta subito per evitare il blocco popup
    const url = await this.sb.receiptUrl(e.receipt_path!);
    if (win) win.location.href = url;
  }

  async logout() {
    await this.sb.signOut();
    await this.router.navigateByUrl('/login');
  }

  private async reload() {
    const [expenses, totals] = await Promise.all([
      this.sb.expenses(this.month()),
      this.sb.monthlyTotals(this.month()),
    ]);
    this.expenses.set(expenses);
    this.totals.set(totals);
  }

  private emptyForm() {
    return { amount: null as number | null, spent_on: today(), category_id: null as number | null, note: '' };
  }
}
