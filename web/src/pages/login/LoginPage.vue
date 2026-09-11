<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useSessionStore } from '@/features/auth'
import { LoadingButton } from '@/shared/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/shared/ui/field'
import { Input } from '@/shared/ui/input'
import { Badge } from '@/shared/ui/badge'
import { Activity, ShieldCheck, Zap } from '@lucide/vue'
import { toast } from '@/shared/lib/toast'
import { errorMessage } from '@/shared/lib/errors'

const router = useRouter()
const session = useSessionStore()

const username = ref('')
const password = ref('')
const loading = ref(false)
const errors = ref<Record<string, string>>({})

async function submit() {
  errors.value = {}
  if (!username.value.trim()) errors.value.username = '请输入管理员用户名'
  if (!password.value) errors.value.password = '请输入密码'
  if (Object.keys(errors.value).length || loading.value) return

  loading.value = true
  try {
    await session.login(username.value.trim(), password.value)
    toast.success('登录成功，正在进入大屏控制台')
    router.replace('/')
  } catch (error) {
    toast.error(errorMessage(error))
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="relative flex min-h-svh w-full items-center justify-center p-6 md:p-10 bg-background selection:bg-primary selection:text-primary-foreground font-sans">
    <div class="w-full max-w-sm z-10">
      <div class="flex flex-col gap-6">
        <div class="flex flex-col items-center gap-2 text-center">
          <div class="size-11 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shadow-md shadow-primary/20">
            <Activity class="size-6" />
          </div>
          <div class="flex items-center gap-2 mt-1">
            <h1 class="text-2xl font-bold tracking-tight text-foreground font-sans">New-Pro</h1>
            <Badge variant="outline" class="text-[11px] font-mono font-medium px-2 py-0.5 h-5">v1.0.0</Badge>
          </div>
          <p class="text-xs text-muted-foreground font-medium">
            多维实时监控与运行态势分析系统
          </p>
        </div>

        <Card class="border-border/80 shadow-sm bg-card rounded-xl">
          <CardHeader class="pb-4">
            <CardTitle class="text-lg font-bold text-foreground">控制台安全登录</CardTitle>
            <CardDescription class="text-xs text-muted-foreground font-normal">
              输入系统凭据以进入监控大屏
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form @submit.prevent="submit">
              <FieldGroup class="gap-4">
                <Field :data-invalid="!!errors.username">
                  <FieldLabel for="username" class="text-xs font-semibold text-foreground">账号</FieldLabel>
                  <Input
                    id="username"
                    v-model="username"
                    placeholder="请输入管理员账号"
                    autocomplete="username"
                    required
                    class="h-9.5 text-sm font-normal text-foreground placeholder:text-muted-foreground/60"
                  />
                  <FieldError :errors="errors.username ? [errors.username] : []" />
                </Field>

                <Field :data-invalid="!!errors.password">
                  <FieldLabel for="password" class="text-xs font-semibold text-foreground">密码</FieldLabel>
                  <Input
                    id="password"
                    v-model="password"
                    type="password"
                    placeholder="请输入密码"
                    autocomplete="current-password"
                    required
                    class="h-9.5 text-sm font-normal text-foreground placeholder:text-muted-foreground/60"
                  />
                  <FieldError :errors="errors.password ? [errors.password] : []" />
                </Field>

                <div class="pt-2">
                  <LoadingButton
                    type="submit"
                    class="w-full font-semibold h-9.5 text-sm cursor-pointer shadow-xs"
                    :loading="loading"
                    :disabled="!username.trim() || !password"
                  >
                    立即登录
                  </LoadingButton>
                </div>
              </FieldGroup>
            </form>

            <div class="mt-5 pt-3.5 border-t border-border/40 flex items-center justify-between text-xs text-muted-foreground font-medium">
              <span class="flex items-center gap-1.5">
                <span class="size-1.5 rounded-full bg-emerald-500"></span>
                只读直连无写入
              </span>
              <span class="flex items-center gap-1.5">
                <span class="size-1.5 rounded-full bg-sky-500"></span>
                聚合索引就绪
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  </div>
</template>
