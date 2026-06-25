/**
 * Servicio de autenticación.
 *
 * Responsabilidades:
 *  - Login: llama al backend y almacena los tokens en localStorage.
 *  - Logout: limpia tokens y redirige al login.
 *  - Refresh: solicita un nuevo access token usando el refresh token.
 *  - Expone señales reactivas: isAuthenticated, currentUser.
 *
 * Los tokens se guardan en localStorage para persistencia entre sesiones.
 * El interceptor los lee desde aquí para adjuntarlos a cada request.
 */

import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { TokenResponse, User } from '../models/earthquake.model';

const ACCESS_TOKEN_KEY = 'seismic_access_token';
const REFRESH_TOKEN_KEY = 'seismic_refresh_token';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);

  /** Signal reactiva: true si hay un access token almacenado. */
  readonly isAuthenticated = signal<boolean>(!!this.getAccessToken());

  /** Signal con los datos del usuario actual (null si no autenticado). */
  readonly currentUser = signal<User | null>(null);

  /**
   * Envía las credenciales al backend y almacena los tokens recibidos.
   * Actualiza la señal isAuthenticated.
   */
  login(username: string, password: string): Observable<TokenResponse> {
    const body = new URLSearchParams();
    body.set('username', username);
    body.set('password', password);

    return this.http
      .post<TokenResponse>(`${environment.apiUrl}/auth/login`, body.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
      .pipe(
        tap((tokens) => {
          this._storeTokens(tokens);
          this.isAuthenticated.set(true);
        })
      );
  }

  /**
   * Solicita un nuevo access token usando el refresh token.
   * Llamado automáticamente por el interceptor al recibir un 401.
   */
  refresh(): Observable<TokenResponse> {
    const refreshToken = this.getRefreshToken();
    return this.http
      .post<TokenResponse>(`${environment.apiUrl}/auth/refresh`, {
        refresh_token: refreshToken,
      })
      .pipe(tap((tokens) => this._storeTokens(tokens)));
  }

  /** Limpia tokens y redirige al login. */
  logout(): void {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    this.isAuthenticated.set(false);
    this.currentUser.set(null);
    this.router.navigate(['/login']);
  }

  /** Retorna el access token almacenado, o null si no existe. */
  getAccessToken(): string | null {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  }

  /** Retorna el refresh token almacenado, o null si no existe. */
  getRefreshToken(): string | null {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  }

  private _storeTokens(tokens: TokenResponse): void {
    localStorage.setItem(ACCESS_TOKEN_KEY, tokens.access_token);
    localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refresh_token);
  }
}
