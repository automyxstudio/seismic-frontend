/**
 * Componente de login.
 *
 * Usa signals para el estado del formulario (loading, error).
 * Al autenticarse exitosamente, navega al dashboard.
 *
 * Standalone component — no necesita NgModule.
 */

import { Component, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="login-container">
      <div class="login-card">
        <div class="login-header">
          <span class="login-icon">🌍</span>
          <h1>Seismic Platform</h1>
          <p>Monitor de Eventos Sísmicos en Tiempo Real</p>
        </div>

        <form (ngSubmit)="onSubmit()" class="login-form">
          <div class="form-group">
            <label for="username">Usuario</label>
            <input
              id="username"
              type="text"
              [(ngModel)]="username"
              name="username"
              placeholder="admin"
              required
              [disabled]="loading()"
            />
          </div>

          <div class="form-group">
            <label for="password">Contraseña</label>
            <input
              id="password"
              type="password"
              [(ngModel)]="password"
              name="password"
              placeholder="••••••••"
              required
              [disabled]="loading()"
            />
          </div>

          @if (error()) {
            <div class="error-message">{{ error() }}</div>
          }

          <button type="submit" [disabled]="loading()" class="btn-login">
            @if (loading()) { Iniciando sesión... }
            @else { Iniciar Sesión }
          </button>
        </form>
      </div>
    </div>
  `,
  styles: [`
    .login-container {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
    }
    .login-card {
      background: rgba(255,255,255,0.05);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 16px;
      padding: 2.5rem;
      width: 100%;
      max-width: 400px;
    }
    .login-header { text-align: center; margin-bottom: 2rem; }
    .login-icon { font-size: 3rem; }
    .login-header h1 { color: #fff; margin: 0.5rem 0 0.25rem; font-size: 1.5rem; }
    .login-header p { color: rgba(255,255,255,0.5); font-size: 0.85rem; margin: 0; }
    .form-group { margin-bottom: 1.25rem; }
    .form-group label { display: block; color: rgba(255,255,255,0.7); font-size: 0.85rem; margin-bottom: 0.4rem; }
    .form-group input {
      width: 100%; padding: 0.75rem 1rem; border-radius: 8px;
      border: 1px solid rgba(255,255,255,0.15);
      background: rgba(255,255,255,0.08); color: #fff; font-size: 1rem;
      box-sizing: border-box;
    }
    .form-group input:focus { outline: none; border-color: #e94560; }
    .error-message { background: rgba(233,69,96,0.2); color: #e94560; padding: 0.75rem; border-radius: 8px; font-size: 0.85rem; margin-bottom: 1rem; }
    .btn-login {
      width: 100%; padding: 0.875rem; background: #e94560; color: #fff;
      border: none; border-radius: 8px; font-size: 1rem; font-weight: 600;
      cursor: pointer; transition: opacity 0.2s;
    }
    .btn-login:disabled { opacity: 0.6; cursor: not-allowed; }
    .btn-login:hover:not(:disabled) { opacity: 0.9; }
  `],
})
export class LoginComponent {
  private authService = inject(AuthService);
  private router = inject(Router);

  username = '';
  password = '';

  /** Signals para estado reactivo del formulario. */
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  onSubmit(): void {
    if (!this.username || !this.password) return;

    this.loading.set(true);
    this.error.set(null);

    this.authService.login(this.username, this.password).subscribe({
      next: () => this.router.navigate(['/dashboard']),
      error: () => {
        this.error.set('Credenciales incorrectas. Intenta de nuevo.');
        this.loading.set(false);
      },
    });
  }
}
