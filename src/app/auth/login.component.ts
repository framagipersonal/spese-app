import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../supabase.service';

@Component({
  selector: 'app-login',
  imports: [FormsModule],
  template: `
    <main class="card narrow">
      <h1>Spese</h1>
      @if (sent()) {
        <p>Ti ho mandato un link a <strong>{{ email }}</strong>. Aprilo da questo browser per entrare.</p>
      } @else {
        <form (ngSubmit)="send()">
          <label>
            Email
            <input type="email" name="email" [(ngModel)]="email" required autocomplete="email" />
          </label>
          <button type="submit" [disabled]="loading() || !email">
            {{ loading() ? 'Invio…' : 'Mandami il link' }}
          </button>
        </form>
      }
      @if (error()) {
        <p class="error">{{ error() }}</p>
      }
    </main>
  `,
})
export class LoginComponent {
  private readonly sb = inject(SupabaseService);

  email = '';
  readonly loading = signal(false);
  readonly sent = signal(false);
  readonly error = signal<string | null>(null);

  async send() {
    this.loading.set(true);
    this.error.set(null);
    const { error } = await this.sb.signIn(this.email);
    this.loading.set(false);
    if (error) this.error.set(error.message);
    else this.sent.set(true);
  }
}
